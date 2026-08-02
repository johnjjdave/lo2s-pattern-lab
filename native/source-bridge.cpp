#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <iterator>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <Processing.NDI.Lib.h>
#include "SpoutLibrary.h"
#include "shared-frame.h"

namespace {

// 1600 px is the best measured compromise for the CPU/readback bridge: it is
// materially sharper than the original 1280 proxy without turning a wide
// Resolume composition into multi-megabyte IPC frames that build latency.
constexpr unsigned kNdiLowLatencyMaxWidth = 1600;
constexpr unsigned kNdiHighQualityMaxWidth = 2560;
constexpr unsigned kSpoutLowLatencyMaxWidth = 1280;
constexpr unsigned kSpoutHighQualityMaxWidth = 2560;

#pragma pack(push, 1)
struct FrameHeader {
  std::uint32_t magic = 0x4632534c; // LS2F
  std::uint32_t version = 1;
  std::uint32_t width = 0;
  std::uint32_t height = 0;
  std::uint32_t stride = 0;
  std::uint32_t fps_n = 0;
  std::uint32_t fps_d = 1;
  std::uint32_t payload_size = 0;
};
#pragma pack(pop)

struct NdiApi {
  HMODULE module = nullptr;
  const NDIlib_v5* api = nullptr;

  ~NdiApi() {
    if (api) api->destroy();
    if (module) FreeLibrary(module);
  }
};

struct SpoutApi {
  HMODULE module = nullptr;
  SPOUTHANDLE api = nullptr;

  ~SpoutApi() {
    if (api) api->Release();
    if (module) FreeLibrary(module);
  }
};

std::string json_escape(const std::string& value) {
  std::string result;
  result.reserve(value.size() + 8);
  for (unsigned char character : value) {
    switch (character) {
      case '\\': result += "\\\\"; break;
      case '"': result += "\\\""; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (character < 0x20) {
          char escaped[7];
          std::snprintf(escaped, sizeof(escaped), "\\u%04x", character);
          result += escaped;
        } else {
          result += static_cast<char>(character);
        }
    }
  }
  return result;
}

std::wstring executable_directory() {
  std::vector<wchar_t> path(32768);
  const DWORD length = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  std::wstring full(path.data(), length);
  const auto slash = full.find_last_of(L"\\/");
  return slash == std::wstring::npos ? L"." : full.substr(0, slash);
}

HMODULE load_first(const std::vector<std::wstring>& candidates) {
  for (const auto& candidate : candidates) {
    if (candidate.empty()) continue;
    if (HMODULE module = LoadLibraryW(candidate.c_str())) return module;
  }
  return nullptr;
}

std::wstring env_path(const wchar_t* name, const wchar_t* filename) {
  wchar_t value[32768];
  const DWORD size = GetEnvironmentVariableW(name, value, static_cast<DWORD>(std::size(value)));
  if (!size || size >= std::size(value)) return {};
  std::wstring path(value, size);
  if (!path.empty() && path.back() != L'\\') path += L'\\';
  path += filename;
  return path;
}

bool load_ndi(NdiApi& ndi, std::string& error) {
  const auto adjacent = executable_directory() + L"\\Processing.NDI.Lib.x64.dll";
  ndi.module = load_first({
    adjacent,
    env_path(L"NDI_RUNTIME_DIR_V6", L"Processing.NDI.Lib.x64.dll"),
    env_path(L"NDI_RUNTIME_DIR_V5", L"Processing.NDI.Lib.x64.dll"),
    L"C:\\Program Files\\NDI\\NDI 6 Runtime\\v6\\Processing.NDI.Lib.x64.dll",
    L"C:\\Program Files\\NDI\\NDI 5 Runtime\\v5\\Processing.NDI.Lib.x64.dll",
    L"Processing.NDI.Lib.x64.dll",
  });
  if (!ndi.module) {
    error = "NDI Runtime 5 or newer is not installed.";
    return false;
  }
  using LoadApi = const NDIlib_v5* (*)();
  auto load = reinterpret_cast<LoadApi>(GetProcAddress(ndi.module, "NDIlib_v5_load"));
  if (!load) load = reinterpret_cast<LoadApi>(GetProcAddress(ndi.module, "NDIlib_v4_load"));
  if (!load) {
    error = "The installed NDI Runtime is missing its receiver entry point.";
    return false;
  }
  ndi.api = load();
  if (!ndi.api || !ndi.api->initialize()) {
    error = "The NDI Runtime could not initialize on this computer.";
    return false;
  }
  return true;
}

bool load_spout(SpoutApi& spout, std::string& error) {
  const auto adjacent = executable_directory() + L"\\SpoutLibrary.dll";
  spout.module = load_first({adjacent, L"SpoutLibrary.dll"});
  if (!spout.module) {
    error = "SpoutLibrary.dll is missing from the beta installation.";
    return false;
  }
  using GetSpoutFn = SPOUTHANDLE (WINAPI*)();
  auto get_spout = reinterpret_cast<GetSpoutFn>(GetProcAddress(spout.module, "GetSpout"));
  if (!get_spout || !(spout.api = get_spout())) {
    error = "The Spout receiver could not be created.";
    return false;
  }
  return true;
}

void print_error_json(const std::string& error) {
  std::cout << "{\"ok\":false,\"error\":\"" << json_escape(error) << "\"}" << std::endl;
}

bool has_control_pipe() {
  static const bool value = GetFileType(GetStdHandle(STD_INPUT_HANDLE)) == FILE_TYPE_PIPE;
  return value;
}

bool stop_requested() {
  if (!has_control_pipe()) return false;
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  DWORD available = 0;
  if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) return true;
  while (available) {
    char command = 0;
    DWORD read = 0;
    if (!ReadFile(input, &command, 1, &read, nullptr) || !read) return true;
    if (command == 'q') return true;
    if (!PeekNamedPipe(input, nullptr, 0, nullptr, &available, nullptr)) return true;
  }
  return false;
}

bool wait_for_frame_acknowledgement() {
  if (!has_control_pipe()) return true;
  HANDLE input = GetStdHandle(STD_INPUT_HANDLE);
  while (true) {
    char command = 0;
    DWORD read = 0;
    if (!ReadFile(input, &command, 1, &read, nullptr) || !read) return false;
    if (command == 'q') return false;
    if (command == 'a') return true;
  }
}

void apply_alpha_as_brightness(unsigned char* pixels, std::size_t pixel_count) {
  for (std::size_t index = 0; index < pixel_count; ++index) {
    auto* pixel = pixels + index * 4;
    const unsigned alpha = pixel[3];
    if (alpha < 255) {
      pixel[0] = static_cast<unsigned char>((static_cast<unsigned>(pixel[0]) * alpha + 127) / 255);
      pixel[1] = static_cast<unsigned char>((static_cast<unsigned>(pixel[1]) * alpha + 127) / 255);
      pixel[2] = static_cast<unsigned char>((static_cast<unsigned>(pixel[2]) * alpha + 127) / 255);
    }
    pixel[3] = 255;
  }
}

int list_ndi() {
  NdiApi ndi;
  std::string error;
  if (!load_ndi(ndi, error)) {
    print_error_json(error);
    return 2;
  }
  NDIlib_find_create_t settings{};
  settings.show_local_sources = true;
  auto finder = ndi.api->find_create_v2(&settings);
  if (!finder) {
    print_error_json("NDI source discovery could not start.");
    return 3;
  }
  std::vector<std::pair<std::string, std::string>> discovered;
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(7);
  do {
    ndi.api->find_wait_for_sources(finder, 500);
    std::uint32_t count = 0;
    const auto* sources = ndi.api->find_get_current_sources(finder, &count);
    for (std::uint32_t index = 0; index < count; ++index) {
      const std::string name = sources[index].p_ndi_name ? sources[index].p_ndi_name : "NDI Source";
      const std::string id = sources[index].p_url_address ? sources[index].p_url_address : name;
      if (std::none_of(discovered.begin(), discovered.end(), [&](const auto& source) { return source.first == id; })) discovered.emplace_back(id, name);
    }
  } while (std::chrono::steady_clock::now() < deadline);
  std::cout << "{\"ok\":true,\"sources\":[";
  for (std::size_t index = 0; index < discovered.size(); ++index) {
    if (index) std::cout << ',';
    std::cout << "{\"id\":\"" << json_escape(discovered[index].first)
              << "\",\"name\":\"" << json_escape(discovered[index].second) << "\"}";
  }
  std::cout << "]}" << std::endl;
  ndi.api->find_destroy(finder);
  return 0;
}

int list_spout() {
  SpoutApi spout;
  std::string error;
  if (!load_spout(spout, error)) {
    print_error_json(error);
    return 2;
  }
  const auto sources = spout.api->GetSenderList();
  std::cout << "{\"ok\":true,\"sources\":[";
  for (std::size_t index = 0; index < sources.size(); ++index) {
    if (index) std::cout << ',';
    std::cout << "{\"id\":\"" << json_escape(sources[index]) << "\",\"name\":\"" << json_escape(sources[index]) << "\"}";
  }
  std::cout << "]}" << std::endl;
  return 0;
}

bool write_frame(const unsigned char* pixels, std::uint32_t width, std::uint32_t height, std::uint32_t fps_n, std::uint32_t fps_d) {
  FrameHeader header;
  header.width = width;
  header.height = height;
  header.stride = width * 4;
  header.fps_n = fps_n;
  header.fps_d = fps_d ? fps_d : 1;
  header.payload_size = header.stride * height;
  if (std::fwrite(&header, sizeof(header), 1, stdout) != 1) return false;
  if (std::fwrite(pixels, header.payload_size, 1, stdout) != 1) return false;
  return std::fflush(stdout) == 0;
}

unsigned char* fit_frame_width(unsigned char* source, unsigned source_width, unsigned source_height, unsigned maximum_width,
                               std::vector<unsigned char>& resized, unsigned& output_width, unsigned& output_height) {
  output_width = source_width;
  output_height = source_height;
  if (source_width <= maximum_width) return source;
  output_width = maximum_width;
  output_height = std::max(1u, static_cast<unsigned>(static_cast<std::uint64_t>(source_height) * maximum_width / source_width));
  resized.resize(static_cast<std::size_t>(output_width) * output_height * 4);
  for (unsigned y = 0; y < output_height; ++y) {
    const unsigned source_y = static_cast<unsigned>(static_cast<std::uint64_t>(y) * source_height / output_height);
    const auto* source_row = source + static_cast<std::size_t>(source_y) * source_width * 4;
    auto* destination_row = resized.data() + static_cast<std::size_t>(y) * output_width * 4;
    for (unsigned x = 0; x < output_width; ++x) {
      const unsigned source_x = static_cast<unsigned>(static_cast<std::uint64_t>(x) * source_width / output_width);
      reinterpret_cast<std::uint32_t*>(destination_row)[x] = reinterpret_cast<const std::uint32_t*>(source_row)[source_x];
    }
  }
  return resized.data();
}

unsigned char* convert_ndi_frame(const NDIlib_video_frame_v2_t& frame, unsigned maximum_width,
                                 std::vector<unsigned char>& output, unsigned& output_width, unsigned& output_height) {
  output_width = std::min<unsigned>(frame.xres, maximum_width);
  output_height = output_width == static_cast<unsigned>(frame.xres)
    ? static_cast<unsigned>(frame.yres)
    : std::max(1u, static_cast<unsigned>(static_cast<std::uint64_t>(frame.yres) * output_width / frame.xres));
  output.resize(static_cast<std::size_t>(output_width) * output_height * 4);
  const bool rgba = frame.FourCC == NDIlib_FourCC_type_RGBA;
  const bool rgbx = frame.FourCC == NDIlib_FourCC_type_RGBX;
  const bool bgra = frame.FourCC == NDIlib_FourCC_type_BGRA;
  for (unsigned y = 0; y < output_height; ++y) {
    const unsigned source_y = static_cast<unsigned>(static_cast<std::uint64_t>(y) * frame.yres / output_height);
    const auto* source_row = frame.p_data + static_cast<std::ptrdiff_t>(source_y) * frame.line_stride_in_bytes;
    auto* destination_row = output.data() + static_cast<std::size_t>(y) * output_width * 4;
    for (unsigned x = 0; x < output_width; ++x) {
      const unsigned source_x = static_cast<unsigned>(static_cast<std::uint64_t>(x) * frame.xres / output_width);
      const auto* source = source_row + static_cast<std::size_t>(source_x) * 4;
      auto* destination = destination_row + static_cast<std::size_t>(x) * 4;
      const unsigned alpha = (rgba || bgra) ? source[3] : 255;
      const unsigned red = bgra ? source[2] : source[0];
      const unsigned green = source[1];
      const unsigned blue = bgra ? source[0] : source[2];
      destination[0] = static_cast<unsigned char>((red * alpha + 127) / 255);
      destination[1] = static_cast<unsigned char>((green * alpha + 127) / 255);
      destination[2] = static_cast<unsigned char>((blue * alpha + 127) / 255);
      destination[3] = 255;
    }
  }
  return (rgba || rgbx || bgra) ? output.data() : nullptr;
}

void status(const std::string& state, const std::string& name, unsigned width = 0, unsigned height = 0, double fps = 0) {
  std::cerr << "{\"status\":\"" << json_escape(state) << "\",\"name\":\"" << json_escape(name) << "\",\"width\":" << width
            << ",\"height\":" << height << ",\"fps\":" << fps << "}" << std::endl;
}

struct SharedFrameMapping {
  HANDLE handle = nullptr;
  lo2s::SharedFrameHeader* header = nullptr;
  std::string name;

  ~SharedFrameMapping() { close(); }
  void close() {
    if (header) UnmapViewOfFile(header);
    if (handle) CloseHandle(handle);
    header = nullptr;
    handle = nullptr;
    name.clear();
  }
  bool create(unsigned width, unsigned height, unsigned generation) {
    close();
    const auto payload = static_cast<std::uint32_t>(static_cast<std::uint64_t>(width) * height * 4);
    const auto total = lo2s::shared_mapping_bytes(payload);
    name = "Local\\LO2S-NDI-" + std::to_string(GetCurrentProcessId()) + "-" + std::to_string(generation);
    handle = CreateFileMappingA(INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE, static_cast<DWORD>(total >> 32), static_cast<DWORD>(total), name.c_str());
    if (!handle) return false;
    header = static_cast<lo2s::SharedFrameHeader*>(MapViewOfFile(handle, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, total));
    if (!header) { close(); return false; }
    ZeroMemory(header, total);
    header->magic = lo2s::kSharedFrameMagic;
    header->version = lo2s::kSharedFrameVersion;
    header->header_bytes = sizeof(lo2s::SharedFrameHeader);
    header->slot_count = lo2s::kSharedFrameSlots;
    header->width = width;
    header->height = height;
    header->stride = width * 4;
    header->payload_bytes = payload;
    header->latest_slot = -1;
    return true;
  }
};

void status_shared(const std::string& source_name, const SharedFrameMapping& shared, double fps) {
  std::cerr << "{\"status\":\"connected\",\"name\":\"" << json_escape(source_name)
            << "\",\"width\":" << shared.header->width << ",\"height\":" << shared.header->height
            << ",\"fps\":" << fps << ",\"transport\":\"shared-memory\",\"mapping\":\""
            << json_escape(shared.name) << "\",\"payloadBytes\":" << shared.header->payload_bytes << "}" << std::endl;
}

int capture_ndi(const std::string& requested_name, bool low_latency) {
  NdiApi ndi;
  std::string error;
  if (!load_ndi(ndi, error)) {
    status("error", error);
    return 2;
  }
  NDIlib_find_create_t find_settings{};
  find_settings.show_local_sources = true;
  auto finder = ndi.api->find_create_v2(&find_settings);
  if (!finder) {
    status("error", "NDI source discovery could not start.");
    return 3;
  }

  NDIlib_source_t selected{};
  std::string selected_name;
  std::string selected_url;
  for (int attempt = 0; attempt < 30 && selected_name.empty(); ++attempt) {
    ndi.api->find_wait_for_sources(finder, 500);
    std::uint32_t count = 0;
    const auto* sources = ndi.api->find_get_current_sources(finder, &count);
    for (std::uint32_t index = 0; index < count; ++index) {
      const std::string name = sources[index].p_ndi_name ? sources[index].p_ndi_name : "";
      const std::string url = sources[index].p_url_address ? sources[index].p_url_address : "";
      if (requested_name.empty() || requested_name == name || requested_name == url) {
        selected_name = name;
        selected_url = url;
        break;
      }
    }
  }
  if (selected_name.empty()) {
    ndi.api->find_destroy(finder);
    status("error", requested_name.empty() ? "No NDI sources were found." : "The selected NDI source is unavailable.");
    return 4;
  }
  selected.p_ndi_name = selected_name.c_str();
  selected.p_url_address = selected_url.empty() ? nullptr : selected_url.c_str();

  NDIlib_recv_create_v3_t settings{};
  settings.source_to_connect_to = selected;
  // The browser texture consumes RGBA. Request it directly from NDI so the
  // bridge does not perform a second full-resolution BGR-to-RGB conversion.
  settings.color_format = NDIlib_recv_color_format_RGBX_RGBA;
  // Always request the full NDI raster. Low latency is produced locally so it
  // does not inherit NDI's heavily compressed low-bandwidth proxy.
  settings.bandwidth = NDIlib_recv_bandwidth_highest;
  settings.allow_video_fields = false;
  settings.p_ndi_recv_name = "LO2S Pattern Lab 3D Beta";
  auto receiver = ndi.api->recv_create_v3(&settings);
  ndi.api->find_destroy(finder);
  if (!receiver) {
    status("error", "The selected NDI source could not be opened.");
    return 5;
  }

  status("connecting", selected_name);
  SharedFrameMapping shared;
  std::vector<unsigned char> output_pixels;
  unsigned mapping_generation = 0;
  LONG64 captured_frames = 0;
  LONG64 published_frames = 0;
  LONG64 overwritten_frames = 0;
  LONG64 conversion_microseconds = 0;
  auto last_conversion = std::chrono::steady_clock::now() - std::chrono::seconds(1);
  while (!stop_requested()) {
    NDIlib_video_frame_v2_t frame{};
    const auto type = ndi.api->recv_capture_v2(receiver, &frame, nullptr, nullptr, 100);
    if (type == NDIlib_frame_type_error) { status("error", "The NDI source connection was lost."); break; }
    if (type != NDIlib_frame_type_video) continue;
    captured_frames += 1;
    for (int queued = 0; queued < 32; ++queued) {
      NDIlib_video_frame_v2_t newer{};
      const auto newer_type = ndi.api->recv_capture_v2(receiver, &newer, nullptr, nullptr, 0);
      if (newer_type != NDIlib_frame_type_video) break;
      ndi.api->recv_free_video_v2(receiver, &frame);
      frame = newer;
      captured_frames += 1;
    }
    const auto now = std::chrono::steady_clock::now();
    const auto minimum_interval = std::chrono::milliseconds(low_latency ? 16 : 33);
    if (now - last_conversion < minimum_interval) { ndi.api->recv_free_video_v2(receiver, &frame); continue; }
    last_conversion = now;
    unsigned output_width = 0, output_height = 0;
    const auto conversion_started = std::chrono::steady_clock::now();
    auto* output = convert_ndi_frame(frame, low_latency ? kNdiLowLatencyMaxWidth : kNdiHighQualityMaxWidth, output_pixels, output_width, output_height);
    conversion_microseconds += std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - conversion_started).count();
    const double fps = frame.frame_rate_D ? static_cast<double>(frame.frame_rate_N) / frame.frame_rate_D : 0;
    ndi.api->recv_free_video_v2(receiver, &frame);
    if (!output) { status("error", "The NDI source returned an unsupported pixel format."); break; }
    if (!shared.header || shared.header->width != output_width || shared.header->height != output_height) {
      if (!shared.create(output_width, output_height, ++mapping_generation)) { status("error", "Unable to allocate the NDI shared-memory frame buffer."); break; }
      shared.header->captured_frames = captured_frames;
      shared.header->published_frames = published_frames;
      shared.header->overwritten_frames = overwritten_frames;
      shared.header->conversion_microseconds = conversion_microseconds;
      status_shared(selected_name, shared, fps);
    }
    const LONG64 next_sequence = published_frames + 1;
    const LONG64 consumed = InterlockedCompareExchange64(&shared.header->consumer_sequence, 0, 0);
    if (next_sequence - consumed > static_cast<LONG64>(lo2s::kSharedFrameSlots)) overwritten_frames += 1;
    const auto slot = static_cast<std::uint32_t>((next_sequence - 1) % lo2s::kSharedFrameSlots);
    std::memcpy(lo2s::shared_slot(shared.header, slot), output, shared.header->payload_bytes);
    MemoryBarrier();
    InterlockedExchange64(&shared.header->slot_sequences[slot], next_sequence);
    InterlockedExchange(&shared.header->latest_slot, static_cast<LONG>(slot));
    InterlockedExchange64(&shared.header->latest_sequence, next_sequence);
    published_frames = next_sequence;
    InterlockedExchange64(&shared.header->captured_frames, captured_frames);
    InterlockedExchange64(&shared.header->published_frames, published_frames);
    InterlockedExchange64(&shared.header->overwritten_frames, overwritten_frames);
    InterlockedExchange64(&shared.header->conversion_microseconds, conversion_microseconds);
  }
  ndi.api->recv_destroy(receiver);
  return 0;
}

int capture_spout(const std::string& requested_name, bool low_latency) {
  SpoutApi spout;
  std::string error;
  if (!load_spout(spout, error)) {
    status("error", error);
    return 2;
  }
  if (!spout.api->CreateOpenGL(nullptr)) {
    status("error", "Spout could not create its DirectX/OpenGL receiver.");
    return 3;
  }
  if (!requested_name.empty()) spout.api->SetReceiverName(requested_name.c_str());
  status("connecting", requested_name.empty() ? "Active Spout sender" : requested_name);
  std::vector<unsigned char> rgba;
  std::vector<unsigned char> resized;
  unsigned width = 0;
  unsigned height = 0;
  bool announced = false;
  auto last_output = std::chrono::steady_clock::now() - std::chrono::seconds(1);
  while (!stop_requested()) {
    if (!spout.api->IsConnected()) {
      if (!spout.api->ReceiveTexture()) { Sleep(30); continue; }
    }
    const unsigned next_width = spout.api->GetSenderWidth();
    const unsigned next_height = spout.api->GetSenderHeight();
    if (!next_width || !next_height) continue;
    // Spout requires IsUpdated to be polled every cycle so a sender/format
    // change is acknowledged even when its dimensions changed at the same time.
    const bool sender_updated = spout.api->IsUpdated();
    if (next_width != width || next_height != height || sender_updated) {
      width = next_width;
      height = next_height;
      rgba.resize(static_cast<std::size_t>(width) * height * 4);
      announced = false;
      continue;
    }
    // Canvas/ImageData expects the first row to be the top of the image. Spout
    // already delivers the sender in that orientation, so do not invert it.
    if (!spout.api->ReceiveImage(rgba.data(), GL_RGBA, false)) { Sleep(5); continue; }
    if (!spout.api->IsFrameNew()) { Sleep(1); continue; }
    const auto now = std::chrono::steady_clock::now();
    const auto minimum_interval = std::chrono::milliseconds(low_latency ? 16 : 33);
    if (now - last_output < minimum_interval) continue;
    last_output = now;
    unsigned output_width = 0;
    unsigned output_height = 0;
    auto* output = fit_frame_width(rgba.data(), width, height, low_latency ? kSpoutLowLatencyMaxWidth : kSpoutHighQualityMaxWidth, resized, output_width, output_height);
    apply_alpha_as_brightness(output, static_cast<std::size_t>(output_width) * output_height);
    if (!announced) {
      status("connected", spout.api->GetSenderName(), output_width, output_height, spout.api->GetSenderFps());
      announced = true;
    }
    const auto fps = std::max(1.0, spout.api->GetSenderFps());
    if (!write_frame(output, output_width, output_height, static_cast<unsigned>(fps * 1000), 1000) || !wait_for_frame_acknowledgement()) break;
  }
  spout.api->ReleaseReceiver();
  spout.api->CloseOpenGL();
  return 0;
}

int self_test_shared_memory() {
  SharedFrameMapping shared;
  if (!shared.create(4, 2, 1)) return 2;
  status_shared("LO2S shared-memory self-test", shared, 60);
  for (LONG64 sequence = 1; sequence <= 24; ++sequence) {
    const auto slot = static_cast<std::uint32_t>((sequence - 1) % lo2s::kSharedFrameSlots);
    auto* pixels = lo2s::shared_slot(shared.header, slot);
    for (std::uint32_t index = 0; index < shared.header->payload_bytes; index += 4) {
      pixels[index] = static_cast<unsigned char>(sequence);
      pixels[index + 1] = 80;
      pixels[index + 2] = 160;
      pixels[index + 3] = 255;
    }
    MemoryBarrier();
    InterlockedExchange64(&shared.header->slot_sequences[slot], sequence);
    InterlockedExchange(&shared.header->latest_slot, static_cast<LONG>(slot));
    InterlockedExchange64(&shared.header->latest_sequence, sequence);
    InterlockedExchange64(&shared.header->captured_frames, sequence);
    InterlockedExchange64(&shared.header->published_frames, sequence);
    InterlockedExchange64(&shared.header->conversion_microseconds, sequence * 100);
    Sleep(16);
  }
  Sleep(500);
  return 0;
}

std::string argument_value(int argc, char** argv, const std::string& name) {
  for (int index = 1; index + 1 < argc; ++index) if (argv[index] == name) return argv[index + 1];
  return {};
}

} // namespace

int main(int argc, char** argv) {
  _setmode(_fileno(stdout), _O_BINARY);
  const std::string operation = argc > 1 ? argv[1] : "";
  const std::string kind = argc > 2 ? argv[2] : "";
  if (operation == "--self-test-shared") return self_test_shared_memory();
  if (operation == "--list") {
    if (kind == "ndi") return list_ndi();
    if (kind == "spout") return list_spout();
  }
  if (operation == "--capture") {
    const std::string source = argument_value(argc, argv, "--source");
    const std::string quality = argument_value(argc, argv, "--quality");
    if (kind == "ndi") return capture_ndi(source, quality == "latency");
    if (kind == "spout") return capture_spout(source, quality == "latency");
  }
  std::cerr << "Usage: lo2s-source-bridge --list ndi|spout OR --capture ndi|spout --source name --quality latency|quality" << std::endl;
  return 1;
}
