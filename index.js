const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

// memória simples
const userState = {};

app.post("/", async (req, res) => {
  const message = req.body.message;

  if (message && message.text) {
    const chatId = message.chat.id;
    const text = message.text;

    console.log("Mensagem recebida:", text);

    // 🔹 MENU (não precisa mais /start sempre)
    if (text === "/start") {
      await sendMenu(chatId);
      return res.sendStatus(200);
    }

    // 🔹 INICIO GANHO
    if (text === "➕ Adicionar ganho") {
      userState[chatId] = { step: "data", tipo: "ganho" };

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Escolha a data:",
          reply_markup: {
            keyboard: [
              ["📅 Hoje", "📅 Ontem"],
              ["📅 Outra data"]
            ],
            resize_keyboard: true
          }
        }),
      });

      return res.sendStatus(200);
    }

    // 🔹 DATA HOJE
    if (text === "📅 Hoje" && userState[chatId]) {
      userState[chatId].data = new Date().toISOString();
      userState[chatId].step = "valor";

      await perguntarValor(chatId);
      return res.sendStatus(200);
    }

    // 🔹 DATA ONTEM
    if (text === "📅 Ontem" && userState[chatId]) {
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);

      userState[chatId].data = ontem.toISOString();
      userState[chatId].step = "valor";

      await perguntarValor(chatId);
      return res.sendStatus(200);
    }

    // 🔹 OUTRA DATA
    if (text === "📅 Outra data" && userState[chatId]) {
      userState[chatId].step = "digitando_data";

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Digite a data no formato DD/MM/AAAA (ex: 10/04/2026):",
        }),
      });

      return res.sendStatus(200);
    }

    // 🔹 RECEBE DATA MANUAL (BR)
    if (userState[chatId]?.step === "digitando_data") {
      const partes = text.split("/");

      if (partes.length !== 3) {
        return enviarErro(chatId, "Formato inválido. Use DD/MM/AAAA");
      }

      const [dia, mes, ano] = partes;
      const data = new Date(`${ano}-${mes}-${dia}`);

      if (isNaN(data)) {
        return enviarErro(chatId, "Data inválida.");
      }

      userState[chatId].data = data.toISOString();
      userState[chatId].step = "valor";

      await perguntarValor(chatId);
      return res.sendStatus(200);
    }

    // 🔹 RECEBE VALOR
    if (userState[chatId]?.step === "valor") {
      const valor = parseFloat(text);

      if (isNaN(valor)) {
        return enviarErro(chatId, "Digite um número válido.");
      }

      const dados = userState[chatId];

      try {
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
            Data: dados.data
          })
        });

        const resp = await response.text();
        console.log("SUPABASE RESPONSE:", resp);

      } catch (error) {
        console.log("ERRO AO SALVAR:", error);
      }

      delete userState[chatId];

      // 🔹 VOLTA PRO MENU AUTOMÁTICO
      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Registrado: R$${valor}\n\nEscolha uma opção:`,
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
  }

  res.sendStatus(200);
});

// 🔹 FUNÇÕES AUXILIARES

async function perguntarValor(chatId) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "Digite o valor:",
    }),
  });
}

async function enviarErro(chatId, msg) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg,
    }),
  });
}

async function sendMenu(chatId) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
}

app.get("/", (req, res) => {
  res.send("Bot rodando 🚀");
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
🧪 TESTE FINAL
