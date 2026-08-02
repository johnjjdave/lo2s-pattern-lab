# LO2S native source bridge

This Windows-only helper receives real NDI and Spout frames for the isolated 3D beta. It keeps native SDK work outside the browser renderer and sends uncompressed RGBA frames to Electron using a framed binary pipe.

- NDI always receives the full-bandwidth source. Low Latency uses a fused RGBA conversion/downscale, drains queued frames, and always presents the newest available frame instead of accumulating delay. High Quality retains the larger raster with a controlled frame cadence.
- Spout uses the official Spout2 `SpoutLibrary` receiver and enumerates actual Spout senders.
- Video Devices remain on Chromium's existing `getUserMedia` path.
