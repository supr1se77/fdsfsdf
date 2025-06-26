const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    ComponentType
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { logAdmin } = require('../utils/logger'); 

const estoquePath = path.resolve(__dirname, "../estoque.json");

// ==================================================================================
// FUNÇÕES DE LÓGICA DE CATEGORIA
// ==================================================================================
function isSteamCategory(catName) {
    const upper = catName.toUpperCase();
    return upper === 'STEAM' || upper.startsWith('STEAM-');
}
function isRobloxCategory(catName) {
    const upper = catName.toUpperCase();
    return upper === 'ROBLOX' || upper.startsWith('ROBLOX-');
}
function isAccountCategory(catName) { // Contas Steam ou Roblox
    return isSteamCategory(catName) || isRobloxCategory(catName);
}
function isGiftcardCategory(catName) {
    const upper = catName.toUpperCase().trim();
    return upper.includes('GIFTCARD');
}


// ==================================================================================
// FUNÇÕES DE UTILIDADE
// ==================================================================================
function lerEstoque() {
    if (!fs.existsSync(estoquePath)) fs.writeFileSync(estoquePath, JSON.stringify({}, null, 2));
    let estoque = JSON.parse(fs.readFileSync(estoquePath, "utf-8"));
    return estoque;
}
function salvarEstoque(estoque) {
    fs.writeFileSync(estoquePath, JSON.stringify(estoque, null, 2));
}
function exportarEstoque() {
    return new AttachmentBuilder(estoquePath, { name: "estoque.json" });
}
function criarBotoesPainel() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("estoque:adicionar_menu").setLabel("➕ Adicionar Manual").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("estoque:adicionar_arquivo").setLabel("➕ Adicionar por Arquivo").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("estoque:editar_precos").setLabel("💸 Preços").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("estoque:remover_categoria").setLabel("🗑 Remover Categoria").setStyle(ButtonStyle.Danger)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("estoque:limpar_estoque").setLabel("🔥 Limpar Tudo").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("estoque:exportar_estoque").setLabel("⬇️ Exportar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("estoque:atualizar_painel").setLabel("🔄 Atualizar").setStyle(ButtonStyle.Primary)
    );
    return [row1, row2];
}
function criarEmbedEstoque(estoque) {
    const embed = new EmbedBuilder().setTitle("🗃️ Painel de Estoque Profissional").setColor("#8a00ff").setTimestamp();
    const categorias = Object.keys(estoque).filter(cat => cat && cat !== "outras");

    const categoriasSteam = categorias.filter(isSteamCategory);
    const categoriasRoblox = categorias.filter(isRobloxCategory);
    const categoriasGiftcard = categorias.filter(isGiftcardCategory);
    const categoriasCartoes = categorias.filter(cat => !isAccountCategory(cat) && !isGiftcardCategory(cat));

    if (categorias.length === 0) { embed.setDescription("⚠️ O estoque está completamente vazio."); return embed; }
    
    const formatarLinha = (cat, dados, tipo) => {
        let nomeAmigavel = cat;
        if (isSteamCategory(cat)) nomeAmigavel = cat.replace(/^STEAM-?/i, '') || "STEAM";
        if (isRobloxCategory(cat)) nomeAmigavel = cat.replace(/^ROBLOX-?/i, '') || "ROBLOX";
        if (isGiftcardCategory(cat)) nomeAmigavel = cat.replace(/^GIFTCARD-?/i, '') || "GIFTCARD";

        const preco = dados.preco ? `R$ ${dados.preco.toFixed(2)}` : "N/D";
        const totalItens = (dados.contas || dados.codigos || dados.cartoes || []).length;
        return `**${nomeAmigavel.toUpperCase()}**: ${totalItens} ${tipo}(s) | Preço: ${preco}`;
    };
    
    if (categoriasSteam.length > 0) embed.addFields({ name: '🎮 CONTAS STEAM', value: categoriasSteam.map(cat => formatarLinha(cat, estoque[cat], "conta")).join("\n") });
    if (categoriasRoblox.length > 0) embed.addFields({ name: '🕹️ CONTAS ROBLOX', value: categoriasRoblox.map(cat => formatarLinha(cat, estoque[cat], "conta")).join("\n") });
    if (categoriasGiftcard.length > 0) embed.addFields({ name: '🎁 GIFT CARDS', value: categoriasGiftcard.map(cat => formatarLinha(cat, estoque[cat], "código")).join("\n") });
    if (categoriasCartoes.length > 0) embed.addFields({ name: '💳 CARTÕES DE CRÉDITO', value: categoriasCartoes.map(cat => formatarLinha(cat, estoque[cat], "cc")).join("\n") });
    
    return embed;
}
async function handleArquivoImportado(message) {
    try {
        if (!message.attachments || message.attachments.size === 0) { return false; }
        const arquivo = message.attachments.first();
        const nome = arquivo.name.toLowerCase();
        if (!nome.endsWith(".json") && !nome.endsWith(".txt")) { return false; }

        const res = await fetch(arquivo.url);
        const text = await res.text();
        let estoque = lerEstoque();
        let statusMsg = "";
        if (nome.endsWith(".json")) {
            salvarEstoque(JSON.parse(text));
            statusMsg = "✅ Estoque `.json` importado com sucesso!";
            await logAdmin(message.client, message.author, `Importou o estoque completo a partir do arquivo \`${arquivo.name}\`.`, 'Importação de Arquivo');
        } else if (nome.endsWith(".txt")) {
            const linhas = text.split("\n").map(l => l.trim()).filter(Boolean);
            let addCC = 0, addContas = 0;
            const detectarCategoriaCartao = (linha) => { const p = linha.split("|").map(s => s.trim().toLowerCase()); const c = ["black", "platinum", "classic", "gold", "standard", "infinite", "business", "amex"]; for (let i = p.length - 1; i >= 0; i--) { if (c.includes(p[i])) return p[i]; } return "outras"; };
            for (const linha of linhas) {
                if(linha.includes("|") && linha.includes(":")){ const [l, e] = linha.split("|"); const cat = `CONTA-IMPORTADA`; if(!estoque[cat]) estoque[cat] = { contas: [], preco: null }; if(l && e){ estoque[cat].contas.push({login: l, email_link: e}); addContas++; } }
                else { const cat = detectarCategoriaCartao(linha); if(!estoque[cat]) estoque[cat] = { cartoes: [], preco: null }; else if (!estoque[cat].cartoes) {estoque[cat].cartoes = []}; estoque[cat].cartoes.push(linha); addCC++; }
            }
            salvarEstoque(estoque);
            statusMsg = `✅ Estoque \`.txt\` importado! Adicionados: ${addCC} cartões e ${addContas} contas.`;
            await logAdmin(message.client, message.author, `Importou ${addCC} cartões e ${addContas} contas via arquivo \`${arquivo.name}\`.`, 'Importação de Arquivo');
        }
        const botMsg = await message.reply(statusMsg);
        setTimeout(() => { message.delete().catch(() => {}); botMsg.delete().catch(() => {}); }, 10000);
        return true;
    } catch (e) { console.error("Erro ao importar estoque: ", e); const m = await message.reply("❌ Erro ao importar estoque: " + String(e?.message || e)); setTimeout(() => m.delete().catch(() => {}), 5000); return false; }
}

module.exports = {
    data: new SlashCommandBuilder().setName("estoque").setDescription("Gerencie facilmente o estoque de produtos."),
    handleArquivoImportado,

    async execute(interaction) {
        await interaction.reply({ embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel(), ephemeral: true });
    },

    async handleButton(interaction) {
        const action = interaction.customId.split(':')[1];
        
        switch (action) {
            case "atualizar_painel":
                return interaction.update({ embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel() });

            case "adicionar_menu": {
                const modal = new ModalBuilder().setCustomId("estoque:modal_add").setTitle("Adicionar ao Estoque");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('categoria').setLabel("Categoria (Ex: STEAM, ROBLOX, GIFTCARD)").setStyle(TextInputStyle.Short).setRequired(true)),
                    // ===== MUDANÇA AQUI =====
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('itens').setLabel("Itens (um por linha)").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Steam: usuario:senha|link\nRoblox: usuario:senha\nGiftcard: codigo123\nCartão: 4021..."))
                );
                return interaction.showModal(modal);
            }
            
            case 'adicionar_arquivo': {
                await interaction.reply({ content: 'Aguardando... Por favor, envie o arquivo `.txt` ou `.json`.\nVocê tem 60 segundos.', ephemeral: true });
                const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
                const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });
                collector.on('collect', async msg => {
                    if (await this.handleArquivoImportado(msg)) {
                        await interaction.followUp({ content: 'Arquivo processado. Painel atualizado:', embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel(), ephemeral: true });
                    }
                });
                collector.on('end', (_, reason) => { if (reason === 'time') interaction.editReply({ content: 'Tempo esgotado.', components: [] }).catch(()=>{}); });
                return;
            }

            case "editar_precos": {
                const estoque = lerEstoque();
                const categorias = Object.keys(estoque).filter(c => c && c !== "outras");
                if (!categorias.length) return interaction.reply({ content: "Nenhuma categoria para editar.", ephemeral: true });
                const options = categorias.map(cat => ({ label: cat.toUpperCase(), description: `Preço: ${estoque[cat].preco ? `R$${estoque[cat].preco.toFixed(2)}` : 'N/D'}`, value: cat }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId("estoque:select_preco").setPlaceholder("Escolha a categoria").addOptions(options);
                return interaction.reply({ content: "Selecione a categoria para editar o preço:", components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }

            case "remover_categoria": {
                const estoque = lerEstoque();
                const categorias = Object.keys(estoque).filter(c => c && c !== "outras");
                if (!categorias.length) return interaction.reply({ content: "Nenhuma categoria para remover.", ephemeral: true });
                const options = categorias.map(cat => ({ label: cat.toUpperCase(), description: `${(estoque[cat].contas || estoque[cat].codigos || estoque[cat].cartoes || []).length} item(s)`, value: cat }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId("estoque:select_remover").setPlaceholder("Escolha a categoria").addOptions(options);
                return interaction.reply({ content: "Selecione a categoria para remover:", components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }

            case "limpar_estoque":
                salvarEstoque({});
                await logAdmin(interaction.client, interaction.user, 'Limpou **todo** o estoque.', '/estoque');
                await interaction.reply({ content: "🔥 Estoque limpo!", ephemeral: true });
                return interaction.followUp({ embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel(), ephemeral: true });

            case "exportar_estoque":
                await logAdmin(interaction.client, interaction.user, 'Exportou o arquivo de estoque.', '/estoque');
                return interaction.reply({ content: "Aqui está o estoque:", files: [exportarEstoque()], ephemeral: true });
        }
    },

    async handleSelectMenu(interaction) {
        const action = interaction.customId.split(':')[1];
        const categoria = interaction.values[0];

        if (action === "select_preco") {
            const estoque = lerEstoque();
            const modal = new ModalBuilder().setCustomId("estoque:modal_preco").setTitle(`Editar Preço: ${categoria.toUpperCase()}`);
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("categoria_hidden").setLabel("Categoria").setStyle(TextInputStyle.Short).setValue(categoria).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("preco").setLabel("Novo preço (Ex: 25.50)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(estoque[categoria]?.preco?.toFixed(2) || '0.00'))
            );
            return interaction.showModal(modal);
        }

        if (action === "select_remover") {
            let estoque = lerEstoque();
            delete estoque[categoria];
            salvarEstoque(estoque);
            await logAdmin(interaction.client, interaction.user, `Removeu a categoria **${categoria.toUpperCase()}** e todos os seus itens.`, '/estoque');
            await interaction.update({ content: `✅ Categoria **${categoria.toUpperCase()}** removida.`, components: [], embeds: [] });
            return interaction.followUp({ content: 'Painel atualizado:', embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel(), ephemeral: true });
        }
    },

    async handleModal(interaction) {
        const action = interaction.customId.split(':')[1];
        await interaction.deferReply({ ephemeral: true });
        let estoque = lerEstoque();

        try {
            if (action === "modal_add") {
                const categoria = interaction.fields.getTextInputValue("categoria").trim();
                const linhas = interaction.fields.getTextInputValue("itens").trim().split("\n").filter(Boolean);
                
                // ===== MUDANÇA AQUI =====
                // A lógica agora é separada para cada tipo de conta
                const isSteam = isSteamCategory(categoria);
                const isRbx = isRobloxCategory(categoria);
                const isGift = isGiftcardCategory(categoria);
                const isAcc = isSteam || isRbx;

                if (!estoque[categoria]) { 
                    if (isAcc) estoque[categoria] = { contas: [], preco: null };
                    else if (isGift) estoque[categoria] = { codigos: [], preco: null };
                    else estoque[categoria] = { cartoes: [], preco: null };
                } else { 
                    if (isAcc && !estoque[categoria].contas) estoque[categoria].contas = [];
                    if (isGift && !estoque[categoria].codigos) estoque[categoria].codigos = [];
                    if (!isAcc && !isGift && !estoque[categoria].cartoes) estoque[categoria].cartoes = [];
                }

                if (isSteam) {
                    linhas.forEach(l => {
                        const [login, email_link] = l.split("|");
                        if (login && email_link) estoque[categoria].contas.push({ login, email_link });
                    });
                } else if (isRbx) {
                    linhas.forEach(l => {
                        const delimiterPos = l.indexOf(':');
                        if (delimiterPos > 0) {
                            const login = l.substring(0, delimiterPos);
                            const senha = l.substring(delimiterPos + 1);
                            if (login && senha) estoque[categoria].contas.push({ login, senha });
                        }
                    });
                } else if (isGift) {
                    linhas.forEach(l => estoque[categoria].codigos.push(l));
                } else {
                    linhas.forEach(l => estoque[categoria].cartoes.push(l));
                }
                
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Adicionou ${linhas.length} item(ns) à categoria **${categoria.toUpperCase()}**.`, '/estoque');
                await interaction.editReply({ content: `✅ ${linhas.length} item(s) adicionado(s) à categoria **${categoria.toUpperCase()}**.` });
            }

            if (action === "modal_preco") {
                const categoria = interaction.fields.getTextInputValue("categoria_hidden").trim();
                const precoNum = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));

                if (isNaN(precoNum)) return interaction.editReply({ content: "❌ Valor de preço inválido."});
                
                if (!estoque[categoria]) return interaction.editReply({ content: "❌ Categoria não encontrada!"});
                
                estoque[categoria].preco = precoNum;
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Alterou o preço da categoria **${categoria.toUpperCase()}** para **R$ ${precoNum.toFixed(2)}**.`, '/estoque');
                await interaction.editReply({ content: `✅ Preço de **${categoria.toUpperCase()}** alterado para **R$ ${precoNum.toFixed(2)}**.` });
            }

            return interaction.followUp({ content: 'Painel atualizado:', embeds: [criarEmbedEstoque(lerEstoque())], components: criarBotoesPainel(), ephemeral: true });

        } catch (e) {
            console.error("Erro no modal:", e);
            await interaction.editReply({ content: "❌ Ocorreu um erro. Verifique o console." });
        }
    }
};