const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "SEU_TOKEN_AQUI";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "SUA_URL_AQUI";
const SUPABASE_KEY = "SUA_ANON_KEY_AQUI";

app.post("/", async (req, res) => {
  const message = req.body.message;

  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    console.log("Mensagem recebida:", text);

    // verifica se é número
    const valor = parseFloat(text);

    if (!isNaN(valor)) {
      // salvar no supabase
      await fetch(`${SUPABASE_URL}/rest/v1/registros`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          user_id: chatId.toString(),
          tipo: "ganho",
          valor: valor
        })
      });

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
