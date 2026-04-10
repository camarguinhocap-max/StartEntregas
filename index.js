const express = require("express");
const app = express();

app.use(express.json());

const TOKEN = "8613535785:AAFPfKjg94JavGcU7-WznFRotjHEAGBdVaQ";

// 👇 CONFIG SUPABASE
const SUPABASE_URL = "https://wvqrpliefwtmbswbbjnt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2cXJwbGllZnd0bWJzd2Jiam50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAxNTUsImV4cCI6MjA5MTM3NjE1NX0.E8vzsrpWYNKfrYXtn2DFo7m7ZS0__Weo6TcQOa9AbHw";

const userState = {};

app.post("/", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  console.log("Mensagem:", text);

  // ================= MENU =================
  if (text === "/start") return sendMenu(chatId);

  // ================= RESUMO COMPLETO =================
  if (text.toLowerCase().includes("resumo")) {
    try {
      const response = await fetch(
        SUPABASE_URL + "/rest/v1/Registros?select=Valor,Data,Tipo&user_id=eq." + chatId,
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const dados = await response.json();

      const hoje = new Date();

      const diaSemana = hoje.getDay();
      const diff = diaSemana === 0 ? -6 : 1 - diaSemana;

      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() + diff);
      inicioSemana.setHours(0, 0, 0, 0);

      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      fimSemana.setHours(23, 59, 59, 999);

      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      inicioMes.setHours(0, 0, 0, 0);

      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      fimMes.setHours(23, 59, 59, 999);

      let ganhos = 0;
      let gastos = 0;

      let ganhosHoje = 0;
      let gastosHoje = 0;

      let ganhosSemana = 0;
      let gastosSemana = 0;

      let ganhosMes = 0;
      let gastosMes = 0;

      for (let i = 0; i < dados.length; i++) {
        const item = dados[i];
        const valor = Number(item.Valor || 0);
        const data = new Date(item.Data);

        const isGasto = item.Tipo === "gasto";

        // TOTAL
        if (isGasto) gastos += valor;
        else ganhos += valor;

        // HOJE
        if (data.toDateString() === hoje.toDateString()) {
          if (isGasto) gastosHoje += valor;
          else ganhosHoje += valor;
        }

        // SEMANA
        if (data >= inicioSemana && data <= fimSemana) {
          if (isGasto) gastosSemana += valor;
          else ganhosSemana += valor;
        }

        // MÊS
        if (data >= inicioMes && data <= fimMes) {
          if (isGasto) gastosMes += valor;
          else ganhosMes += valor;
        }
      }

      const saldo = ganhos - gastos;
      const saldoHoje = ganhosHoje - gastosHoje;
      const saldoSemana = ganhosSemana - gastosSemana;
      const saldoMes = ganhosMes - gastosMes;

      // 🔥 AQUI ESTAVA O ERRO (CORRIGIDO)
      let mensagem =
        "📊 *RESUMO FINANCEIRO*\n\n" +

        "📅 *HOJE*\n" +
        "💰 Ganhos: R$ " + ganhosHoje.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosHoje.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + saldoHoje.toFixed(2) + "\n\n" +

        "📆 *SEMANA*\n" +
        "💰 Ganhos: R$ " + ganhosSemana.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosSemana.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + saldoSemana.toFixed(2) + "\n\n" +

        "🗓️ *MÊS*\n" +
        "💰 Ganhos: R$ " + ganhosMes.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosMes.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + saldoMes.toFixed(2) + "\n\n" +

        "💼 *TOTAL GERAL*\n" +
        "💰 Ganhos: R$ " + ganhos.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastos.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + saldo.toFixed(2);

      // 🔥 LINK DO DASHBOARD
      const link = "https://v0-startentregras.vercel.app/?user_id=" + chatId;

      mensagem += "\n\n📈 Ver dashboard completo:\n" + link;

      return sendMessage(chatId, mensagem, {
        parse_mode: "Markdown"
      });

    } catch (error) {
      console.log(error);
      return sendMessage(chatId, "Erro ao buscar dados.");
    }
  }

  // ================= REGISTRAR GASTO =================
  if (text.includes("Registrar gasto")) {
    userState[chatId] = { step: "categoria_gasto", tipo: "gasto" };

    return sendMessage(chatId, "Escolha o tipo de gasto:", {
      keyboard: [
        ["⛽ Combustível"],
        ["💼 Pró-labore"],
        ["📦 Outros"]
      ],
      resize_keyboard: true
    });
  }

  if (userState[chatId] && userState[chatId].step === "categoria_gasto") {
    let categoria = "";

    if (text.includes("Combustível")) categoria = "combustivel";
    else if (text.includes("Pró-labore")) categoria = "pro_labore";
    else if (text.includes("Outros")) categoria = "outros";

    if (!categoria) return sendMessage(chatId, "Escolha válida.");

    userState[chatId].categoria = categoria;
    userState[chatId].step = "data";

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data"]
      ],
      resize_keyboard: true
    });
  }

  // ================= ADICIONAR GANHO =================
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

  // ================= DATAS =================
  if (text.includes("Hoje") && userState[chatId]) {
    userState[chatId].data = new Date().toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  if (text.includes("Ontem") && userState[chatId]) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    userState[chatId].data = d.toISOString();
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor:");
  }

  if (text.includes("Outra data") && userState[chatId]) {
    userState[chatId].step = "digitando_data";
    return sendMessage(chatId, "Digite a data (DD/MM/AAAA):");
  }

  if (userState[chatId] && userState[chatId].step === "digitando_data") {
    const partes = text.split("/");
    if (partes.length !== 3) return sendMessage(chatId, "Formato inválido.");

    const data = new Date(partes[2], partes[1] - 1, partes[0]);

    userState[chatId].data = data.toISOString();
    userState[chatId].step = "valor";

    return sendMessage(chatId, "Digite o valor:");
  }

  // ================= VALOR =================
  if (userState[chatId] && userState[chatId].step === "valor") {
    const valor = parseFloat(text.replace(",", "."));
    if (isNaN(valor)) return sendMessage(chatId, "Número inválido.");

    const dados = userState[chatId];

    try {
      await fetch(SUPABASE_URL + "/rest/v1/Registros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify({
          user_id: chatId.toString(),
          Tipo: dados.tipo,
          Categoria: dados.categoria || null,
          Valor: valor,
          Data: dados.data
        })
      });
    } catch (e) {
      console.log(e);
    }

    delete userState[chatId];

    return sendMessage(chatId, "✅ Registrado: R$ " + valor, {
      keyboard: [
        ["➕ Adicionar ganho"],
        ["💸 Registrar gasto"],
        ["📊 Ver resumo"]
      ],
      resize_keyboard: true
    });
  }
});

// ================= FUNÇÕES =================
function sendMessage(chatId, text, keyboard) {
  return fetch("https://api.telegram.org/bot" + TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      ...keyboard
    })
  });
}

function sendMenu(chatId) {
  return sendMessage(chatId, "Escolha uma opção:", {
    reply_markup: {
      keyboard: [
        ["➕ Adicionar ganho"],
        ["💸 Registrar gasto"],
        ["📊 Ver resumo"]
      ],
      resize_keyboard: true
    }
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
