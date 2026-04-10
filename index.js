const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

// 👇 memória simples (estado do usuário)
const userState = {};

app.post("/", async (req, res) => {
  const message = req.body.message;

  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    console.log("Mensagem recebida:", text);

    // 🔹 START (menu)
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

    // 🔹 Clique no botão ganho
    if (text === "➕ Adicionar ganho") {
      userState[chatId] = { step: "data", tipo: "ganho" };

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Informe a data (YYYY-MM-DD) ou digite 'hoje':",
        }),
      });

      return res.sendStatus(200);
    }

    // 🔹 Se está esperando DATA
    if (userState[chatId]?.step === "data") {
      let dataFinal;

      if (text.toLowerCase() === "hoje") {
        dataFinal = new Date().toISOString();
      } else {
        dataFinal = new Date(text).toISOString();
      }

      userState[chatId].data = dataFinal;
      userState[chatId].step = "valor";

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Agora digite o valor:",
        }),
      });

      return res.sendStatus(200);
    }

    // 🔹 Se está esperando VALOR
    if (userState[chatId]?.step === "valor") {
      const valor = parseFloat(text);

      if (isNaN(valor)) {
        await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: "Digite um número válido.",
          }),
        });

        return res.sendStatus(200);
      }

      const dados = userState[chatId];

      // salvar no banco
      const response = await fetch(`${SUPABASE_URL}/rest/v1/Registros`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          user_id: chatId.toString(),
          Tipo: dados.tipo,
          Valor: valor,
          data: dados.data
        })
      });

      const resp = await response.text();
      console.log("SUPABASE RESPONSE:", resp);

      // limpa estado
      delete userState[chatId];

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

      return res.sendStatus(200);
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
