export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !apiKey.startsWith("gsk_")) {
    return res.status(401).json({ error: "Invalid Groq API key. It should start with gsk_" });
  }

  try {
    const { system, messages, max_tokens } = req.body;

    // Convert Anthropic format to OpenAI/Groq format
    const groqMessages = [
      { role: "system", content: system },
      ...messages
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        max_tokens: max_tokens || 1500,
        temperature: 0.1,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Convert Groq response back to Anthropic-style format the app expects
    const text = data.choices?.[0]?.message?.content || "";
    res.status(200).json({
      content: [{ type: "text", text }]
    });
  } catch (err) {
    res.status(500).json({ error: "Proxy error", detail: err.message });
  }
}
