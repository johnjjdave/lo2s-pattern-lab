#include <windows.h>
#include <node_api.h>

#include <chrono>
#include <cstring>
#include <string>

#include "shared-frame.h"

namespace {

HANDLE mapping_handle = nullptr;
lo2s::SharedFrameHeader* mapping = nullptr;
std::size_t mapping_size = 0;
LONG64 last_sequence = 0;

void close_mapping() {
  if (mapping) UnmapViewOfFile(mapping);
  if (mapping_handle) CloseHandle(mapping_handle);
  mapping = nullptr;
  mapping_handle = nullptr;
  mapping_size = 0;
  last_sequence = 0;
}

std::string get_string(napi_env env, napi_value value) {
  std::size_t size = 0;
  napi_get_value_string_utf8(env, value, nullptr, 0, &size);
  std::string result(size, '\0');
  napi_get_value_string_utf8(env, value, result.data(), result.size() + 1, &size);
  return result;
}

void set_number(napi_env env, napi_value object, const char* name, double value) {
  napi_value number;
  napi_create_double(env, value, &number);
  napi_set_named_property(env, object, name, number);
}

void set_boolean(napi_env env, napi_value object, const char* name, bool value) {
  napi_value boolean;
  napi_get_boolean(env, value, &boolean);
  napi_set_named_property(env, object, name, boolean);
}

napi_value open_shared(napi_env env, napi_callback_info info) {
  std::size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  close_mapping();
  napi_value result;
  napi_create_object(env, &result);
  if (argc != 1) { set_boolean(env, result, "ok", false); return result; }
  const auto name = get_string(env, argv[0]);
  mapping_handle = OpenFileMappingA(FILE_MAP_READ | FILE_MAP_WRITE, FALSE, name.c_str());
  if (!mapping_handle) { set_boolean(env, result, "ok", false); return result; }
  mapping = static_cast<lo2s::SharedFrameHeader*>(MapViewOfFile(mapping_handle, FILE_MAP_READ | FILE_MAP_WRITE, 0, 0, 0));
  if (!mapping || mapping->magic != lo2s::kSharedFrameMagic || mapping->version != lo2s::kSharedFrameVersion) {
    close_mapping();
    set_boolean(env, result, "ok", false);
    return result;
  }
  mapping_size = lo2s::shared_mapping_bytes(mapping->payload_bytes);
  set_boolean(env, result, "ok", true);
  set_number(env, result, "width", mapping->width);
  set_number(env, result, "height", mapping->height);
  set_number(env, result, "payloadBytes", mapping->payload_bytes);
  return result;
}

napi_value close_shared(napi_env env, napi_callback_info) {
  close_mapping();
  napi_value undefined;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value read_latest(napi_env env, napi_callback_info info) {
  std::size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_value result;
  napi_create_object(env, &result);
  if (!mapping || argc != 1) { set_boolean(env, result, "frame", false); return result; }
  bool typed = false;
  napi_is_typedarray(env, argv[0], &typed);
  if (!typed) { set_boolean(env, result, "frame", false); return result; }
  napi_typedarray_type type;
  std::size_t length = 0;
  void* target = nullptr;
  napi_value array_buffer;
  std::size_t byte_offset = 0;
  napi_get_typedarray_info(env, argv[0], &type, &length, &target, &array_buffer, &byte_offset);
  if ((type != napi_uint8_array && type != napi_uint8_clamped_array) || length < mapping->payload_bytes) {
    set_boolean(env, result, "frame", false);
    return result;
  }

  const auto started = std::chrono::steady_clock::now();
  bool copied = false;
  LONG64 sequence = 0;
  for (int attempt = 0; attempt < 3 && !copied; ++attempt) {
    const LONG slot = InterlockedCompareExchange(&mapping->latest_slot, 0, 0);
    sequence = InterlockedCompareExchange64(&mapping->latest_sequence, 0, 0);
    if (slot < 0 || slot >= static_cast<LONG>(mapping->slot_count) || sequence <= last_sequence) break;
    const LONG64 before = InterlockedCompareExchange64(&mapping->slot_sequences[slot], 0, 0);
    if (before != sequence) continue;
    std::memcpy(target, lo2s::shared_slot(mapping, static_cast<std::uint32_t>(slot)), mapping->payload_bytes);
    MemoryBarrier();
    const LONG64 after = InterlockedCompareExchange64(&mapping->slot_sequences[slot], 0, 0);
    copied = before == after && after == sequence;
  }
  if (copied) {
    last_sequence = sequence;
    InterlockedExchange64(&mapping->consumer_sequence, sequence);
  }
  const auto copy_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count();
  set_boolean(env, result, "frame", copied);
  set_number(env, result, "sequence", static_cast<double>(sequence));
  set_number(env, result, "copyMs", static_cast<double>(copy_us) / 1000.0);
  set_number(env, result, "captured", static_cast<double>(InterlockedCompareExchange64(&mapping->captured_frames, 0, 0)));
  set_number(env, result, "published", static_cast<double>(InterlockedCompareExchange64(&mapping->published_frames, 0, 0)));
  set_number(env, result, "overwritten", static_cast<double>(InterlockedCompareExchange64(&mapping->overwritten_frames, 0, 0)));
  set_number(env, result, "conversionMsTotal", static_cast<double>(InterlockedCompareExchange64(&mapping->conversion_microseconds, 0, 0)) / 1000.0);
  return result;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    { "open", nullptr, open_shared, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "readLatest", nullptr, read_latest, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "close", nullptr, close_shared, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, 3, properties);
  return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
