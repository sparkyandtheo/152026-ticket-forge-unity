// TODO: Implement audio transcription (likely Gemini or Whisper)
// Placeholder so Netlify Functions will bundle this file.
exports.handler = async () => ({
  statusCode: 501,
  body: JSON.stringify({ error: "transcribe not implemented yet" }),
});
