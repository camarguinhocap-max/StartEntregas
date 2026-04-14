// ⚠️ NODE_TLS_REJECT_UNAUTHORIZED: remova esta linha em produção se não for estritamente necessário
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const express = require("express");
const app = express();

app.use(express.json());

// ================= CONFIG =================
// 🔴 SEGURANÇA: credenciais agora só vêm de variáveis de ambiente
// Se alguma estiver faltando, o servidor não inicia e exibe qual está ausente
const required = ["TOKEN", "ADMIN_ID", "SUPABASE_URL", "SUPABASE_KEY", "GRUPO_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Variável de ambiente obrigatória não definida: ${key}`);
    process.exit(1);
  }
}

const TOKEN = process.env.TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GRUPO_ID = process.env.GRUPO_ID;

// ================= STATE =================
const userState = {};

// ================= UTIL =================

function textoParaNumero(texto) {
  texto = texto.toLowerCase();
  const mapa = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, vinte: 20, trinta: 30, quarenta: 40,
    cinquenta: 50, sessenta: 60, setenta: 70,
    oitenta: 80, noventa: 90, cem: 100, cento: 100
  };
  let total = 0;
  texto.split(" ").forEach(p => {
    if (mapa[p] !== undefined) total += mapa[p];
  });
  return total;
}

function categorizarGasto(texto) {
  texto = texto.toLowerCase();
  if (texto.includes("gasolina") || texto.includes("posto") || texto.includes("combustivel")) return "combustivel";
  if (texto.includes("ifood") || texto.includes("comida") || texto.includes("lanche") || texto.includes("almoco") || texto.includes("jantar")) return "alimentacao";
  if (texto.includes("uber") || texto.includes("99") || texto.includes("onibus") || texto.includes("metro")) return "transporte";
  if (texto.includes("aluguel") || texto.includes("luz") || texto.includes("agua") || texto.includes("internet") || texto.includes("telefone")) return "fixo";
  if (texto.includes("oficina") || texto.includes("mecanico") || texto.includes("pneu") || texto.includes("revisao") || texto.includes("manutencao")) return "manutencao";
  if (texto.includes("multa") || texto.includes("ipva") || texto.includes("seguro")) return "documentos";
  if (texto.includes("mochila") || texto.includes("bag") || texto.includes("capacete") || texto.includes("equipamento")) return "equipamentos";
  return "outros";
}

// ================= DATA BRASIL =================
// Retorna data no formato YYYY-MM-DD no fuso de Brasília (UTC-3)
function dataBrasil(date) {
  const d = date || new Date();
  const offset = -3 * 60; // UTC-3 em minutos
  const local = new Date(d.getTime() + offset * 60 * 1000);
  return local.toISOString().substring(0, 10);
}

// 🔧 CORRIGIDO: formata data YYYY-MM-DD sem off-by-one por timezone
function formatarDataBR(dataStr) {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

// ================= SUPABASE HELPERS =================

async function getUsuario(chatId) {
  try {
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        }
      }
    );
    const data = await res.json();
    return data[0] || null;
  } catch (e) {
    console.log("Erro getUsuario:", e);
    return null;
  }
}

async function patchUsuario(userId, body) {
  try {
    await fetch(
      SUPABASE_URL + "/rest/v1/usuarios?id=eq." + userId,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },
        body: JSON.stringify(body)
      }
    );
  } catch (e) {
    console.log("Erro patchUsuario:", e);
  }
}

async function getState(chatId) {
  try {
    const user = await getUsuario(chatId);
    return user?.estado || null;
  } catch (e) {
    console.log("Erro getState:", e);
    return null;
  }
}

async function setState(chatId, state) {
  try {
    await patchUsuario(chatId, {
      estado: state
    });
  } catch (e) {
    console.log("Erro setState:", e);
  }
}

async function clearState(chatId) {
  try {
    await patchUsuario(chatId, {
      estado: null
    });
  } catch (e) {
    console.log("Erro clearState:", e);
  }
}

// ================= SERVER =================

app.post("/", async (req, res) => {
  res.sendStatus(200);

  const message = req.body.message;
  const callback = req.body.callback_query;

  let chatId = null;
  let text = "";

  if (message) {
    chatId = message.chat.id;
    text = message.text ? message.text.trim() : "";
  }

  if (callback) {
    chatId = callback.message.chat.id;
  }

  console.log("BODY:", JSON.stringify(req.body));

  if (!message && !callback) return;

  // ================= CALLBACK =================
  if (callback) {
    const data = callback.data;
    const adminChatId = callback.message.chat.id;

    console.log("Callback recebido:", data);

    if (data.startsWith("aprovar_")) {
      const userId = data.split("_")[1];

      await patchUsuario(userId, {
        plano_ate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      await sendMessage(userId, "✅ Pagamento aprovado! Acesso liberado por 30 dias.");

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          text: "✅ Pagamento aprovado"
        })
      });

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          reply_markup: { inline_keyboard: [] }
        })
      });
    }

    if (data.startsWith("recusar_")) {
      const userId = data.split("_")[1];

      await sendMessage(userId, "❌ Não identificamos seu pagamento. Envie o comprovante.");

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          text: "❌ Pagamento recusado"
        })
      });

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageReplyMarkup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          message_id: callback.message.message_id,
          reply_markup: { inline_keyboard: [] }
        })
      });
    }

    return;
  }

  // ================= VALIDA ACESSO =================
  const user = await getUsuario(chatId);

  if (user && !text.startsWith("/start")) {
    const agora = new Date();
    const trial = new Date(user.trial_fim);
    const plano = user.plano_ate ? new Date(user.plano_ate) : null;

    if (agora > trial && (!plano || agora > plano)) {

      const textoNorm = text.toLowerCase().replace(/[^a-záéíóúãõâêîôûç\s]/gi, "").trim();

      if (textoNorm === "ja paguei" || text.includes("Já paguei")) {
        await setState(chatId, { step: "comprovante" });
        return sendMessage(chatId, "📸 Envie o comprovante do pagamento (print do PIX).");
      }

      const state = await getState(chatId);

      if (message && message.photo && state && state.step === "comprovante") {
        const fileId = message.photo[message.photo.length - 1].file_id;

        await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_ID,
            photo: fileId,
            caption: `💰 COMPROVANTE RECEBIDO\n\n👤 Usuário: ${chatId}`,
            reply_markup: {
              inline_keyboard: [[
                { text: "✅ Aprovar", callback_data: `aprovar_${chatId}` },
                { text: "❌ Recusar", callback_data: `recusar_${chatId}` }
              ]]
            }
          })
        });
      }
  // ================= COMPROVANTE (usuário ativo) =================
  if (message.photo && userState[chatId] && userState[chatId].step === "comprovante") {
    const fileId = message.photo[message.photo.length - 1].file_id;
    console.log("📸 Foto recebida de:", chatId);

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: ADMIN_ID,
        photo: fileId,
        caption: `💰 COMPROVANTE RECEBIDO\n\n👤 Usuário: ${chatId}`,
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Aprovar", callback_data: `aprovar_${chatId}` },
            { text: "❌ Recusar", callback_data: `recusar_${chatId}` }
          ]]
        }
      })
    });

    delete userState[chatId];
    return sendMessage(chatId, "📸 Comprovante enviado para análise! Em breve você receberá a confirmação.");
  }

  console.log("Mensagem:", text);

  // ================= /start =================
  if (text.startsWith("/start")) {
    try {
      const partes = text.split(" ");
      const ref = partes[1];

      const check = await fetch(
        SUPABASE_URL + "/rest/v1/usuarios?id=eq." + chatId.toString(),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const existe = await check.json();

      if (!existe || existe.length === 0) {
        await fetch(SUPABASE_URL + "/rest/v1/usuarios", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          },
          body: JSON.stringify({
            id: chatId.toString(),
            trial_fim: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            indicacoes: 0,
            indicados_pagantes: 0
          })
        });

        if (ref && ref !== chatId.toString()) {
          const refUser = await getUsuario(ref);
          if (refUser) {
            await patchUsuario(ref, {
              indicacoes: (refUser.indicacoes || 0) + 1
            });
          }
        }

        await sendMessage(chatId,
          `👋 Bem-vindo ao *Start Entregas*!\n\n` +
          `📲 Aqui você controla seus ganhos e gastos como entregador de forma simples, pelo Telegram.\n\n` +
          `🎁 Você tem *14 dias grátis* para testar tudo.\n\n` +
          `Vamos começar? 👇`,
          { parse_mode: "Markdown" }
        );
      }
      // 🔧 CORRIGIDO: sendMenu agora é chamado para todos os usuários no /start,
      // inclusive os que já existem no banco (antes ficava silencioso para eles)
    } catch (e) {
      console.log("Erro cadastro:", e);
    }

    return sendMenu(chatId);
  }

  // ================= /ajuda =================
  if (text === "/ajuda" || text.toLowerCase() === "ajuda") {
    return sendMessage(chatId,
      `ℹ️ *AJUDA — Start Entregas*\n\n` +
      `➕ *Adicionar ganho* — registra quanto você recebeu\n` +
      `💸 *Registrar gasto* — registra seus gastos\n` +
      `📊 *Ver resumo* — mostra seus ganhos e gastos de hoje, semana e mês\n` +
      `💡 *Sugerir melhoria* — envie uma ideia pro nosso time\n` +
      `🚀 *Indicar e ganhar* — indique amigos e ganhe dias grátis\n\n` +
      `❌ Digite *Cancelar* a qualquer momento para voltar ao menu.`,
      { parse_mode: "Markdown" }
    );
  }

  // ================= CANCELAR =================
  // 🔧 CORRIGIDO: aceita tanto "cancelar" digitado quanto "❌ Cancelar" do teclado
  if (text.toLowerCase() === "cancelar" || text === "❌ Cancelar") {
    if (userState[chatId]) {
      delete userState[chatId];
    }
    return sendMenu(chatId);
  }

  // ================= SUGESTÃO (início) =================
  if (text.includes("Sugerir melhoria")) {
    userState[chatId] = { step: "sugestao" };
    return sendMessage(chatId, "💡 Digite sua sugestão (ou Cancelar para voltar):");
  }

  // ================= INDICAR =================
  if (text.includes("Indicar")) {
    const link = `https://t.me/startentregas_bot?start=${chatId}`;
    const userAtual = await getUsuario(chatId);
    const totalIndicacoes = userAtual ? (userAtual.indicacoes || 0) : 0;

    return sendMessage(chatId,
      `🚀 *Indique e ganhe 1 mês grátis!*\n\n` +
      `Convide amigos que assinarem o plano.\n\n` +
      `📊 Suas indicações: *${totalIndicacoes}*\n\n` +
      `🔗 Seu link:\n${link}`,
      { parse_mode: "Markdown" }
    );
  }

  // ================= VER RESUMO =================
  if (text.includes("Ver resumo")) {
    try {
      const response = await fetch(
        SUPABASE_URL + "/rest/v1/Registros?select=Valor,Data,Tipo,Categoria&user_id=eq." + chatId.toString(),
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY
          }
        }
      );

      const dados = await response.json();
      const hoje = new Date();

      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      inicioSemana.setHours(0, 0, 0, 0);

      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(inicioSemana.getDate() + 6);
      fimSemana.setHours(23, 59, 59, 999);

      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      let ganhos = 0, gastos = 0;
      let ganhosHoje = 0, gastosHoje = 0;
      let ganhosSemana = 0, gastosSemana = 0;
      let ganhosMes = 0, gastosMes = 0;
      const categoriasMes = {};

      dados.forEach(item => {
        const valor = Number(item.Valor || 0);
        // Extrai só a parte da data (YYYY-MM-DD) ignorando timezone
        const dataStr = item.Data ? item.Data.substring(0, 10) : null;
        const [ano, mes, dia] = dataStr ? dataStr.split('-').map(Number) : [0,0,0];
        const data = new Date(ano, mes - 1, dia);
        const isGasto = item.Tipo === "gasto";

        if (isGasto) gastos += valor;
        else ganhos += valor;

        if (data.toDateString() === hoje.toDateString()) {
          if (isGasto) gastosHoje += valor;
          else ganhosHoje += valor;
        }

        if (data >= inicioSemana && data <= fimSemana) {
          if (isGasto) gastosSemana += valor;
          else ganhosSemana += valor;
        }

        if (data >= inicioMes && data <= fimMes) {
          if (isGasto) {
            gastosMes += valor;
            const cat = item.Categoria || "outros";
            categoriasMes[cat] = (categoriasMes[cat] || 0) + valor;
          } else {
            ganhosMes += valor;
          }
        }
      });

      const categoriasTexto = Object.entries(categoriasMes)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => `   • ${cat}: R$ ${val.toFixed(2)}`)
        .join("\n");

      const link = "https://v0-startentregras.vercel.app/?user_id=" + chatId;

      const mensagem =
        "📊 RESUMO FINANCEIRO\n\n" +
        "📅 HOJE\n" +
        "💰 Ganhos: R$ " + ganhosHoje.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosHoje.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosHoje - gastosHoje).toFixed(2) + "\n\n" +
        "📆 SEMANA\n" +
        "💰 Ganhos: R$ " + ganhosSemana.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosSemana.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosSemana - gastosSemana).toFixed(2) + "\n\n" +
        "🗓 MES\n" +
        "💰 Ganhos: R$ " + ganhosMes.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastosMes.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhosMes - gastosMes).toFixed(2) + "\n" +
        (categoriasTexto ? "\nGastos por categoria:\n" + categoriasTexto + "\n" : "") +
        "\nTOTAL GERAL\n" +
        "💰 Ganhos: R$ " + ganhos.toFixed(2) + "\n" +
        "💸 Gastos: R$ " + gastos.toFixed(2) + "\n" +
        "📊 Saldo: R$ " + (ganhos - gastos).toFixed(2) + "\n\n" +
        "📈 Ver dashboard:\n" + link;

      return sendMessage(chatId, mensagem);

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
        ["⛽ Combustível", "🔧 Manutenção"],
        ["🍔 Alimentação", "📦 Equipamentos"],
        ["📋 Documentos/Multa", "💼 Pró-labore"],
        ["❓ Outros", "❌ Cancelar"]
      ],
      resize_keyboard: true
    });
  }

  // ================= CATEGORIA =================
  if (userState[chatId] && userState[chatId].step === "categoria_gasto") {
    let categoria = "";

    if (text.includes("Combustível")) categoria = "combustivel";
    else if (text.includes("Manutenção")) categoria = "manutencao";
    else if (text.includes("Alimentação")) categoria = "alimentacao";
    else if (text.includes("Equipamentos")) categoria = "equipamentos";
    else if (text.includes("Documentos") || text.includes("Multa")) categoria = "documentos";
    else if (text.includes("Pró-labore")) categoria = "pro_labore";
    else if (text.includes("Outros")) categoria = "outros";
    else if (text.includes("Cancelar")) {
      delete userState[chatId];
      return sendMenu(chatId);
    }

    if (!categoria) return sendMessage(chatId, "Por favor, escolha uma das opções.");

    userState[chatId].categoria = categoria;
    userState[chatId].step = "data";

    return sendMessage(chatId, "Escolha a data:", {
      keyboard: [
        ["📅 Hoje", "📅 Ontem"],
        ["📅 Outra data", "❌ Cancelar"]
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
        ["📅 Outra data", "❌ Cancelar"]
      ],
      resize_keyboard: true
    });
  }

  // ================= DATAS =================
  if (text.includes("Hoje") && userState[chatId]) {
    userState[chatId].data = dataBrasil(new Date());
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
      keyboard: [["❌ Cancelar"]],
      resize_keyboard: true
    });
  }

  if (text.includes("Ontem") && userState[chatId]) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    userState[chatId].data = dataBrasil(d);
    userState[chatId].step = "valor";
    return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
      keyboard: [["❌ Cancelar"]],
      resize_keyboard: true
    });
  }

  if (text.includes("Outra data") && userState[chatId]) {
    userState[chatId].step = "digitando_data";
    return sendMessage(chatId, "Digite o dia (ex: 2) ou DD/MM/AAAA:", {
      keyboard: [["❌ Cancelar"]],
      resize_keyboard: true
    });
  }

  if (userState[chatId] && userState[chatId].step === "digitando_data") {
    if (text.includes("Cancelar")) {
      delete userState[chatId];
      return sendMenu(chatId);
    }

    const texto = text.trim();

    if (/^\d{1,2}$/.test(texto)) {
      const hoje = new Date();
      const dia = parseInt(texto);
      const data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
      userState[chatId].data = dataBrasil(data);
      userState[chatId].step = "valor";
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    const partes = texto.split("/");
    if (partes.length === 3) {
      const data = new Date(partes[2], partes[1] - 1, partes[0]);
      userState[chatId].data = dataBrasil(data);
      userState[chatId].step = "valor";
      return sendMessage(chatId, "Digite o valor (ex: 35,90):", {
        keyboard: [["❌ Cancelar"]],
        resize_keyboard: true
      });
    }

    return sendMessage(chatId, "Formato inválido. Digite o dia (ex: 2) ou DD/MM/AAAA:");
  }

  // ================= SUGESTÃO (captura) =================
  if (userState[chatId] && userState[chatId].step === "sugestao") {
    if (text.toLowerCase().includes("cancelar")) {
      delete userState[chatId];
      return sendMenu(chatId);
    }

    await sendMessage(GRUPO_ID,
      `💡 NOVA SUGESTÃO\n\n👤 User: ${chatId}\n📝 ${text}`
    );

    delete userState[chatId];
    return sendMessage(chatId, "✅ Sugestão enviada! Obrigado pelo feedback.");
  }

  // ================= VALOR =================
  if (userState[chatId] && userState[chatId].step === "valor") {
    if (text.includes("Cancelar")) {
      delete userState[chatId];
      return sendMenu(chatId);
    }

    let valor = parseFloat(text.replace(",", "."));

    if (isNaN(valor)) {
      valor = textoParaNumero(text);
    }

    if (!valor || valor <= 0) return sendMessage(chatId, "Valor inválido. Digite novamente (ex: 35,90):");

    const dados = userState[chatId];
    let categoria = dados.categoria;

    // categorizarGasto é usado como fallback quando a categoria não vem do teclado
    if (dados.tipo === "gasto" && (!categoria || categoria === "outros")) {
      categoria = categorizarGasto(text);
    }

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
          Categoria: categoria,
          Valor: valor,
          Data: dados.data
        })
      });

      const tipoTexto = dados.tipo === "gasto" ? "💸 Gasto" : "💰 Ganho";

      // 🔧 CORRIGIDO: usa formatarDataBR para evitar off-by-one por timezone
      await sendMessage(chatId,
        `✅ *${tipoTexto} registrado!*\n\n` +
        `💲 Valor: R$ ${valor.toFixed(2)}\n` +
        `📂 Categoria: ${categoria}\n` +
        `📅 Data: ${formatarDataBR(dados.data)}`,
        { parse_mode: "Markdown" }
      );

    } catch (e) {
      console.log(e);
      await sendMessage(chatId, "❌ Erro ao salvar. Tente novamente.");
    }

    delete userState[chatId];
    return sendMenu(chatId);
  }
});

// ================= FUNÇÕES =================

function sendMessage(chatId, text, extra) {
  const body = {
    chat_id: chatId,
    text: text
  };

  if (extra) {
    if (extra.keyboard) {
      body.reply_markup = {
        keyboard: extra.keyboard,
        resize_keyboard: extra.resize_keyboard !== false,
        one_time_keyboard: false
      };
    } else if (extra.remove_keyboard) {
      body.reply_markup = { remove_keyboard: true };
    } else if (extra.inline_keyboard) {
      body.reply_markup = { inline_keyboard: extra.inline_keyboard };
    }
    if (extra.parse_mode) body.parse_mode = extra.parse_mode;
  }

  return fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function sendMenu(chatId) {
  return sendMessage(chatId, "Escolha uma opção:", {
    keyboard: [
      ["➕ Adicionar ganho", "💸 Registrar gasto"],
      ["📊 Ver resumo", "💡 Sugerir melhoria"],
      ["🚀 Indicar e ganhar"]
    ],
    resize_keyboard: true
  });
}

app.listen(3000, () => {
  console.log("Servidor rodando 🚀");
});
