const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

const userState = {};

app.post("/", async (req, res) => {
  res.sendStatus(200); // evita loop

  const message = req.body.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  console.log("Mensagem recebida:", text);

  // 🔹 MENU
  if (text === "/start") return sendMenu(chatId);

  // 🔹 RESUMO (corrigido)
  if (text.toLowerCase().includes("resumo")) {
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/Registros?user_id=eq.${chatId}`,
        {
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`
          }
        }
      );

      const dados = await response.json();

      let total = 0;

      dados.forEach(item => {
        total += Number(item.Valor);
      });

      return sendMessage(chatId, `📊 Total acumulado: R$${total}`);

    } catch (error) {
      console.log(error);
      return sendMessage(chatId, "Erro ao buscar dados.");
    }
  }

  // 🔹 INICIO GANHO
  if (text.includes("Adicionar ganho")) {
    userState[chatId] = { step: "data", tipo: "ganho" };

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data"]
      ],
      resize_keyboard: true
    });
  }

  // 🔹 DATA HOJE
  if (text.includes("Hoje") && userState[chatId]) {
    userState[chatId].data = new Date().toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  // 🔹 DATA ONTEM
  if (text.includes("Ontem") && userState[chatId]) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    userState[chatId].data = d.toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  // 🔹 OUTRA DATA
  if (text.includes("Outra data") && userState[chatId]) {
    userState[chatId].step = "digitando_data";
    return sendMessage(chatId, "Digite a data (DD/MM/AAAA):");
  }

  // 🔹 DATA MANUAL (BR)
  if (userState[chatId]?.step === "digitando_data") {
    const regex = /^\d{2}\/\d{2}\/\d{4}$/;

    if (!regex.test(text)) {
      return sendMessage(chatId, "Formato inválido. Use DD/MM/AAAA");
    }

    const [dia, mes, ano] = text.split("/").map(Number);
    const data = new Date(ano, mes - 1, dia);

    if (
      data.getFullYear() !== ano ||
      data.getMonth() !== mes - 1 ||
      data.getDate() !== dia
    ) {
      return sendMessage(chatId, "Data inválida.");
    }

    userState[chatId].data = data.toISOString();
    userState[chatId].step = "valor";

    return sendMessage(chatId, "Digite o valor:");
  }

  // 🔹 VALOR
  if (userState[chatId]?.step === "valor") {
    const valor = parseFloat(text.replace(",", "."));

    if (isNaN(valor)) {
      return sendMessage(chatId, "Digite um número válido.");
    }

    const dados = userState[chatId];

    try {
      await fetch(`${SUPABASE_URL}/rest/v1/Registros`, {
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
    } catch (e) {
      console.log("Erro:", e);
    }

    delete userState[chatId];

    return sendMessage(chatId, `✅ Registrado: R$${valor}`, {
      keyboard: [
        ["➕ Adicionar ganho"],
        ["💸 Registrar gasto"],
        ["📊 Ver resumo"]
      ],
      resize_keyboard: true
    });
  }
});

// 🔹 FUNÇÕES

function sendMessage(chatId, text, keyboard = null) {
  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: keyboard || undefined
    })
  });
}

function sendMenu(chatId) {
  return sendMessage(chatId, "Escolha uma opção:", {
    keyboard: [
      ["➕ Adicionar ganho"],
      ["💸 Registrar gasto"],
      ["📊 Ver resumo"]
    ],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
