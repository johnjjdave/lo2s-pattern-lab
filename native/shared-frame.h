#pragma once

#include <windows.h>
#include <cstddef>
#include <cstdint>

namespace lo2s {

constexpr std::uint32_t kSharedFrameMagic = 0x4d53324c; // LS2M
constexpr std::uint32_t kSharedFrameVersion = 1;
constexpr std::uint32_t kSharedFrameSlots = 3;

struct SharedFrameHeader {
  std::uint32_t magic = kSharedFrameMagic;
  std::uint32_t version = kSharedFrameVersion;
  std::uint32_t header_bytes = 0;
  std::uint32_t slot_count = kSharedFrameSlots;
  std::uint32_t width = 0;
  std::uint32_t height = 0;
  std::uint32_t stride = 0;
  std::uint32_t payload_bytes = 0;
  volatile LONG latest_slot = -1;
  LONG reserved = 0;
  volatile LONG64 latest_sequence = 0;
  volatile LONG64 consumer_sequence = 0;
  volatile LONG64 captured_frames = 0;
  volatile LONG64 published_frames = 0;
  volatile LONG64 overwritten_frames = 0;
  volatile LONG64 conversion_microseconds = 0;
  volatile LONG64 slot_sequences[kSharedFrameSlots] = {};
};

inline std::size_t shared_mapping_bytes(std::uint32_t payload_bytes) {
  return sizeof(SharedFrameHeader) + static_cast<std::size_t>(payload_bytes) * kSharedFrameSlots;
}

inline unsigned char* shared_slot(SharedFrameHeader* header, std::uint32_t index) {
  return reinterpret_cast<unsigned char*>(header) + sizeof(SharedFrameHeader) + static_cast<std::size_t>(header->payload_bytes) * index;
}

} // namespace lo2s
