const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

app.post("/", async (req, res) => {
  const message = req.body.message;

  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    console.log("Mensagem recebida:", text);

    // verifica se é número
    const valor = parseFloat(text);
if (text === "/start") {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: "Escolha uma opção:",
      reply_markup: {
        keyboard: [
          ["➕ Adicionar ganho"],
          ["💸 Registrar gasto"],
          ["📊 Ver resumo"]
        ],
        resize_keyboard: true
      }
    }),
  });

  return res.sendStatus(200);
}
    if (!isNaN(valor)) {
      // salvar no supabase
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Registros`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`
  },
  body: JSON.stringify({
    user_id: chatId.toString(),
    Tipo: "ganho",
    Valor: valor
  })
});

const data = await response.text();
console.log("SUPABASE RESPONSE:", data);

      // resposta
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Registrado: R$${valor}`,
        }),
      });
    }
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Bot rodando 🚀");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
