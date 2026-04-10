/**
 * Apply noise reduction filters to an audio stream using Web Audio API
 * - High-pass filter: removes low-frequency rumble (AC, traffic, etc.)
 * - Compressor: normalizes volume, reduces loud bursts
 * - Gain: boosts speech range
 */
export function createFilteredStream(originalStream: MediaStream): {
  filteredStream: MediaStream
  analyser: AnalyserNode
  cleanup: () => void
} {
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(originalStream)

  // 1. High-pass filter — cut below 100Hz (removes AC hum, rumble)
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 100
  highpass.Q.value = 0.7

  // 2. Low-pass filter — cut above 8000Hz (removes high-pitched noise)
  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = 8000
  lowpass.Q.value = 0.7

  // 3. Peaking filter — boost speech frequencies (1000-4000Hz)
  const speechBoost = ctx.createBiquadFilter()
  speechBoost.type = 'peaking'
  speechBoost.frequency.value = 2500
  speechBoost.Q.value = 1.0
  speechBoost.gain.value = 3 // +3dB boost to speech range

  // 4. Compressor — normalize volume, tame loud sounds
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -30
  compressor.knee.value = 20
  compressor.ratio.value = 4
  compressor.attack.value = 0.005
  compressor.release.value = 0.1

  // 5. Gain — overall level adjustment
  const gain = ctx.createGain()
  gain.gain.value = 1.5

  // 6. Analyser — for waveform visualization
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256

  // Chain: source → highpass → lowpass → speechBoost → compressor → gain → analyser → destination
  source.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(speechBoost)
  speechBoost.connect(compressor)
  compressor.connect(gain)
  gain.connect(analyser)

  // Create output stream from the filtered audio
  const dest = ctx.createMediaStreamDestination()
  gain.connect(dest)

  const filteredStream = dest.stream

  const cleanup = () => {
    source.disconnect()
    highpass.disconnect()
    lowpass.disconnect()
    speechBoost.disconnect()
    compressor.disconnect()
    gain.disconnect()
    analyser.disconnect()
    dest.disconnect()
    ctx.close().catch(() => {})
  }

  return { filteredStream, analyser, cleanup }
}
