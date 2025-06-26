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
// FUNÇÕES DE LÓGICA DE CATEGORIA MELHORADAS
// ==================================================================================
function isSteamCategory(catName) {
    const upper = catName.toUpperCase();
    return upper === 'STEAM' || upper.startsWith('STEAM-') || upper.includes('STEAM');
}
function isRobloxCategory(catName) {
    const upper = catName.toUpperCase();
    return upper === 'ROBLOX' || upper.startsWith('ROBLOX-') || upper.includes('ROBLOX');
}
function isAccountCategory(catName) {
    return isSteamCategory(catName) || isRobloxCategory(catName);
}
function isGiftcardCategory(catName) {
    const upper = catName.toUpperCase().trim();
    return upper.includes('GIFTCARD') || upper.includes('GIFT');
}

// ==================================================================================
// FUNÇÕES DE UTILIDADE MELHORADAS
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
        new ButtonBuilder().setCustomId("estoque:adicionar_steam").setLabel("🎮 Steam").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("estoque:adicionar_roblox").setLabel("🕹️ Roblox").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("estoque:adicionar_giftcard").setLabel("🎁 Gift Cards").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("estoque:adicionar_cartoes").setLabel("💳 Cartões").setStyle(ButtonStyle.Success)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("estoque:adicionar_arquivo").setLabel("📁 Importar Arquivo").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("estoque:editar_precos").setLabel("💸 Editar Preços").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("estoque:gerenciar_categorias").setLabel("🗂️ Gerenciar").setStyle(ButtonStyle.Secondary)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("estoque:limpar_estoque").setLabel("🔥 Limpar Tudo").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("estoque:exportar_estoque").setLabel("⬇️ Exportar").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("estoque:atualizar_painel").setLabel("🔄 Atualizar").setStyle(ButtonStyle.Primary)
    );
    return [row1, row2, row3];
}

function criarEmbedEstoque(estoque) {
    const embed = new EmbedBuilder()
        .setTitle("🗃️ Painel de Estoque Profissional")
        .setColor("#8a00ff")
        .setTimestamp();

    const categorias = Object.keys(estoque).filter(cat => cat && cat !== "outras");

    if (categorias.length === 0) {
        embed.setDescription("⚠️ O estoque está completamente vazio.");
        return embed;
    }

    // Separar categorias por tipo
    const categoriasSteam = categorias.filter(isSteamCategory);
    const categoriasRoblox = categorias.filter(isRobloxCategory);
    const categoriasGiftcard = categorias.filter(isGiftcardCategory);
    const categoriasCartoes = categorias.filter(cat => !isAccountCategory(cat) && !isGiftcardCategory(cat));

    const formatarLinha = (cat, dados, tipo) => {
        let nomeAmigavel = cat;
        
        // Melhor formatação para Steam
        if (isSteamCategory(cat)) {
            const saldo = cat.replace(/^STEAM[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
            nomeAmigavel = `Steam R$ ${saldo}`;
        }
        
        // Melhor formatação para Roblox
        if (isRobloxCategory(cat)) {
            const tipo = cat.replace(/^ROBLOX[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
            nomeAmigavel = `Roblox ${tipo}`;
        }
        
        // Melhor formatação para Gift Cards
        if (isGiftcardCategory(cat)) {
            const plataforma = cat.replace(/^GIFTCARD[-_]?/i, '').replace(/[-_]/g, ' ') || "Genérico";
            nomeAmigavel = `Gift ${plataforma}`;
        }

        const preco = dados.preco ? `R$ ${dados.preco.toFixed(2)}` : "❌ Sem preço";
        const totalItens = (dados.contas || dados.codigos || dados.cartoes || []).length;
        const status = totalItens > 0 ? "✅" : "❌";
        
        return `${status} **${nomeAmigavel}**: ${totalItens} ${tipo}(s) | ${preco}`;
    };
    
    if (categoriasSteam.length > 0) {
        const steamFormatted = categoriasSteam
            .sort((a, b) => {
                const saldoA = parseInt(a.replace(/\D/g, '')) || 0;
                const saldoB = parseInt(b.replace(/\D/g, '')) || 0;
                return saldoA - saldoB;
            })
            .map(cat => formatarLinha(cat, estoque[cat], "conta"));
        embed.addFields({ name: '🎮 CONTAS STEAM', value: steamFormatted.join("\n") });
    }
    
    if (categoriasRoblox.length > 0) {
        embed.addFields({ 
            name: '🕹️ CONTAS ROBLOX', 
            value: categoriasRoblox.map(cat => formatarLinha(cat, estoque[cat], "conta")).join("\n") 
        });
    }
    
    if (categoriasGiftcard.length > 0) {
        embed.addFields({ 
            name: '🎁 GIFT CARDS', 
            value: categoriasGiftcard.map(cat => formatarLinha(cat, estoque[cat], "código")).join("\n") 
        });
    }
    
    if (categoriasCartoes.length > 0) {
        embed.addFields({ 
            name: '💳 CARTÕES DE CRÉDITO', 
            value: categoriasCartoes.map(cat => formatarLinha(cat, estoque[cat], "cartão")).join("\n") 
        });
    }
    
    // Estatísticas gerais
    const totalItens = categorias.reduce((acc, cat) => {
        const dados = estoque[cat];
        return acc + (dados.contas || dados.codigos || dados.cartoes || []).length;
    }, 0);
    
    embed.setFooter({ text: `Total de itens no estoque: ${totalItens} | Categorias: ${categorias.length}` });
    
    return embed;
}

async function handleArquivoImportado(message) {
    try {
        if (!message.attachments || message.attachments.size === 0) return false;
        
        const arquivo = message.attachments.first();
        const nome = arquivo.name.toLowerCase();
        
        if (!nome.endsWith(".json") && !nome.endsWith(".txt")) return false;

        const res = await fetch(arquivo.url);
        const text = await res.text();
        let estoque = lerEstoque();
        let statusMsg = "";

        if (nome.endsWith(".json")) {
            const novoEstoque = JSON.parse(text);
            // Mesclar com estoque existente
            Object.keys(novoEstoque).forEach(cat => {
                if (!estoque[cat]) {
                    estoque[cat] = novoEstoque[cat];
                } else {
                    // Mesclar arrays
                    if (novoEstoque[cat].contas) {
                        estoque[cat].contas = [...(estoque[cat].contas || []), ...novoEstoque[cat].contas];
                    }
                    if (novoEstoque[cat].codigos) {
                        estoque[cat].codigos = [...(estoque[cat].codigos || []), ...novoEstoque[cat].codigos];
                    }
                    if (novoEstoque[cat].cartoes) {
                        estoque[cat].cartoes = [...(estoque[cat].cartoes || []), ...novoEstoque[cat].cartoes];
                    }
                }
            });
            salvarEstoque(estoque);
            statusMsg = "✅ Estoque `.json` importado e mesclado com sucesso!";
            await logAdmin(message.client, message.author, `Importou e mesclou estoque do arquivo \`${arquivo.name}\`.`, 'Importação');
        } 
        else if (nome.endsWith(".txt")) {
            const linhas = text.split("\n").map(l => l.trim()).filter(Boolean);
            let addCC = 0, addContas = 0, addGifts = 0;

            for (const linha of linhas) {
                // Detectar contas (formato: usuario:senha ou usuario:senha|link)
                if (linha.includes(":") && !linha.includes("|")) {
                    const cat = "CONTA-IMPORTADA";
                    if (!estoque[cat]) estoque[cat] = { contas: [], preco: null };
                    const [login, senha] = linha.split(":");
                    if (login && senha) {
                        estoque[cat].contas.push({ login: login.trim(), senha: senha.trim() });
                        addContas++;
                    }
                }
                // Detectar contas Steam (formato: usuario:senha|link)
                else if (linha.includes(":") && linha.includes("|")) {
                    const cat = "STEAM-IMPORTADA";
                    if (!estoque[cat]) estoque[cat] = { contas: [], preco: null };
                    const [loginSenha, link] = linha.split("|");
                    const [login, senha] = loginSenha.split(":");
                    if (login && link) {
                        estoque[cat].contas.push({ login: login.trim(), email_link: link.trim() });
                        addContas++;
                    }
                }
                // Detectar gift cards (códigos simples)
                else if (linha.length > 5 && linha.length < 50 && !linha.includes("|")) {
                    const cat = "GIFTCARD-IMPORTADO";
                    if (!estoque[cat]) estoque[cat] = { codigos: [], preco: null };
                    estoque[cat].codigos.push(linha);
                    addGifts++;
                }
                // Detectar cartões (formato com |)
                else if (linha.includes("|")) {
                    const detectarCategoriaCartao = (linha) => {
                        const p = linha.split("|").map(s => s.trim().toLowerCase());
                        const levels = ["black", "platinum", "classic", "gold", "standard", "infinite", "business"];
                        for (let i = p.length - 1; i >= 0; i--) {
                            if (levels.includes(p[i])) return p[i];
                        }
                        return "outras";
                    };
                    
                    const cat = detectarCategoriaCartao(linha);
                    if (!estoque[cat]) estoque[cat] = { cartoes: [], preco: null };
                    estoque[cat].cartoes.push(linha);
                    addCC++;
                }
            }

            salvarEstoque(estoque);
            statusMsg = `✅ Arquivo \`.txt\` processado! Adicionados: ${addCC} cartões, ${addContas} contas e ${addGifts} gift cards.`;
            await logAdmin(message.client, message.author, `Importou ${addCC} cartões, ${addContas} contas e ${addGifts} gifts via \`${arquivo.name}\`.`, 'Importação');
        }

        const botMsg = await message.reply(statusMsg);
        setTimeout(() => {
            message.delete().catch(() => {});
            botMsg.delete().catch(() => {});
        }, 15000);
        return true;
    } catch (e) {
        console.error("Erro ao importar estoque:", e);
        const m = await message.reply("❌ Erro ao importar: " + String(e?.message || e));
        setTimeout(() => m.delete().catch(() => {}), 8000);
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("estoque")
        .setDescription("Gerencie facilmente o estoque de produtos."),
    
    handleArquivoImportado,

    async execute(interaction) {
        await interaction.reply({ 
            embeds: [criarEmbedEstoque(lerEstoque())], 
            components: criarBotoesPainel(), 
            ephemeral: true 
        });
    },

    async handleButton(interaction) {
        const action = interaction.customId.split(':')[1];
        
        switch (action) {
            case "atualizar_painel":
                return interaction.update({ 
                    embeds: [criarEmbedEstoque(lerEstoque())], 
                    components: criarBotoesPainel() 
                });

            case "adicionar_steam": {
                const modal = new ModalBuilder()
                    .setCustomId("estoque:modal_steam")
                    .setTitle("Adicionar Contas Steam");
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('saldo')
                            .setLabel("Saldo da Steam (ex: 300, 400, 500)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("300")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('preco')
                            .setLabel("Preço de venda (ex: 25.50)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("25.50")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('contas')
                            .setLabel("Contas (usuario:senha|link_email)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setPlaceholder("usuario1:senha1|https://link-email1\nusuario2:senha2|https://link-email2")
                    )
                );
                return interaction.showModal(modal);
            }

            case "adicionar_roblox": {
                const modal = new ModalBuilder()
                    .setCustomId("estoque:modal_roblox")
                    .setTitle("Adicionar Contas Roblox");
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('tipo')
                            .setLabel("Tipo/Categoria (ex: Premium, Robux)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("Premium")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('preco')
                            .setLabel("Preço de venda (ex: 15.00)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("15.00")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('contas')
                            .setLabel("Contas (uma por linha: usuario:senha)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setPlaceholder("usuario1:senha1\nusuario2:senha2")
                    )
                );
                return interaction.showModal(modal);
            }

            case "adicionar_giftcard": {
                const modal = new ModalBuilder()
                    .setCustomId("estoque:modal_giftcard")
                    .setTitle("Adicionar Gift Cards");
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('plataforma')
                            .setLabel("Plataforma (Steam, Google Play, etc)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("Steam")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('preco')
                            .setLabel("Preço de venda (ex: 20.00)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("20.00")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('codigos')
                            .setLabel("Códigos (um por linha)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setPlaceholder("ABCD-EFGH-IJKL\nMNOP-QRST-UVWX")
                    )
                );
                return interaction.showModal(modal);
            }

            case "adicionar_cartoes": {
                const modal = new ModalBuilder()
                    .setCustomId("estoque:modal_cartoes")
                    .setTitle("Adicionar Cartões de Crédito");
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('categoria')
                            .setLabel("Categoria (gold, platinum, black)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("gold")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('preco')
                            .setLabel("Preço de venda (ex: 40.00)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder("40.00")
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('cartoes')
                            .setLabel("Cartões (numero|mes|ano|cvv|info)")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                            .setPlaceholder("4021123456789012|12|25|123|VISA GOLD ITAU")
                    )
                );
                return interaction.showModal(modal);
            }
            
            case 'adicionar_arquivo': {
                await interaction.reply({ 
                    content: '📁 **Aguardando arquivo...**\n\nEnvie um arquivo `.txt` ou `.json` nos próximos 60 segundos.\n\n**Formatos aceitos:**\n• **Steam:** `usuario:senha|link_email`\n• **Roblox:** `usuario:senha`\n• **Gift Cards:** `CODIGO-AQUI`\n• **Cartões:** `numero|mes|ano|cvv|info`', 
                    ephemeral: true 
                });
                
                const filter = m => m.author.id === interaction.user.id && m.attachments.size > 0;
                const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });
                
                collector.on('collect', async msg => {
                    if (await this.handleArquivoImportado(msg)) {
                        await interaction.followUp({ 
                            content: '✅ Arquivo processado com sucesso!', 
                            embeds: [criarEmbedEstoque(lerEstoque())], 
                            components: criarBotoesPainel(), 
                            ephemeral: true 
                        });
                    }
                });
                
                collector.on('end', (_, reason) => {
                    if (reason === 'time') {
                        interaction.editReply({ 
                            content: '⏰ Tempo esgotado. Use o comando novamente para importar arquivos.', 
                            components: [] 
                        }).catch(() => {});
                    }
                });
                return;
            }

            case "editar_precos": {
                const estoque = lerEstoque();
                const categorias = Object.keys(estoque).filter(c => c && c !== "outras");
                
                if (!categorias.length) {
                    return interaction.reply({ content: "❌ Nenhuma categoria encontrada para editar preços.", ephemeral: true });
                }
                
                const options = categorias.slice(0, 25).map(cat => {
                    const dados = estoque[cat];
                    let nomeAmigavel = cat;
                    
                    if (isSteamCategory(cat)) {
                        const saldo = cat.replace(/^STEAM[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
                        nomeAmigavel = `🎮 Steam R$ ${saldo}`;
                    } else if (isRobloxCategory(cat)) {
                        const tipo = cat.replace(/^ROBLOX[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
                        nomeAmigavel = `🕹️ Roblox ${tipo}`;
                    } else if (isGiftcardCategory(cat)) {
                        const plataforma = cat.replace(/^GIFTCARD[-_]?/i, '').replace(/[-_]/g, ' ') || "Genérico";
                        nomeAmigavel = `🎁 Gift ${plataforma}`;
                    } else {
                        nomeAmigavel = `💳 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
                    }
                    
                    return {
                        label: nomeAmigavel,
                        description: `Preço atual: ${dados.preco ? `R$ ${dados.preco.toFixed(2)}` : 'Não definido'}`,
                        value: cat
                    };
                });
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId("estoque:select_preco")
                    .setPlaceholder("Escolha a categoria para editar o preço")
                    .addOptions(options);
                
                return interaction.reply({ 
                    content: "💸 **Editar Preços**\n\nSelecione a categoria que deseja alterar o preço:", 
                    components: [new ActionRowBuilder().addComponents(selectMenu)], 
                    ephemeral: true 
                });
            }

            case "gerenciar_categorias": {
                const estoque = lerEstoque();
                const categorias = Object.keys(estoque).filter(c => c && c !== "outras");
                
                if (!categorias.length) {
                    return interaction.reply({ content: "❌ Nenhuma categoria para gerenciar.", ephemeral: true });
                }
                
                const options = categorias.slice(0, 25).map(cat => {
                    const dados = estoque[cat];
                    const totalItens = (dados.contas || dados.codigos || dados.cartoes || []).length;
                    
                    let nomeAmigavel = cat;
                    if (isSteamCategory(cat)) {
                        const saldo = cat.replace(/^STEAM[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
                        nomeAmigavel = `🎮 Steam R$ ${saldo}`;
                    } else if (isRobloxCategory(cat)) {
                        const tipo = cat.replace(/^ROBLOX[-_]?/i, '').replace(/[-_]/g, ' ') || "Padrão";
                        nomeAmigavel = `🕹️ Roblox ${tipo}`;
                    } else if (isGiftcardCategory(cat)) {
                        const plataforma = cat.replace(/^GIFTCARD[-_]?/i, '').replace(/[-_]/g, ' ') || "Genérico";
                        nomeAmigavel = `🎁 Gift ${plataforma}`;
                    } else {
                        nomeAmigavel = `💳 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
                    }
                    
                    return {
                        label: nomeAmigavel,
                        description: `${totalItens} item(s) | Clique para remover categoria`,
                        value: cat
                    };
                });
                
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId("estoque:select_remover")
                    .setPlaceholder("Escolha a categoria para REMOVER")
                    .addOptions(options);
                
                return interaction.reply({ 
                    content: "🗂️ **Gerenciar Categorias**\n\n⚠️ **ATENÇÃO:** Selecionar uma categoria irá **REMOVÊ-LA COMPLETAMENTE** do estoque!", 
                    components: [new ActionRowBuilder().addComponents(selectMenu)], 
                    ephemeral: true 
                });
            }

            case "limpar_estoque":
                salvarEstoque({});
                await logAdmin(interaction.client, interaction.user, 'Limpou **todo** o estoque.', '/estoque');
                await interaction.reply({ content: "🔥 **Estoque completamente limpo!**", ephemeral: true });
                return interaction.followUp({ 
                    embeds: [criarEmbedEstoque(lerEstoque())], 
                    components: criarBotoesPainel(), 
                    ephemeral: true 
                });

            case "exportar_estoque":
                await logAdmin(interaction.client, interaction.user, 'Exportou o arquivo de estoque.', '/estoque');
                return interaction.reply({ 
                    content: "📁 **Aqui está seu arquivo de estoque:**", 
                    files: [exportarEstoque()], 
                    ephemeral: true 
                });
        }
    },

    async handleSelectMenu(interaction) {
        const action = interaction.customId.split(':')[1];
        const categoria = interaction.values[0];

        if (action === "select_preco") {
            const estoque = lerEstoque();
            const modal = new ModalBuilder()
                .setCustomId("estoque:modal_preco")
                .setTitle(`💸 Editar Preço`);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("categoria_hidden")
                        .setLabel("Categoria")
                        .setStyle(TextInputStyle.Short)
                        .setValue(categoria)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("preco")
                        .setLabel("Novo preço (Ex: 25.50)")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder(estoque[categoria]?.preco?.toFixed(2) || '0.00')
                )
            );
            return interaction.showModal(modal);
        }

        if (action === "select_remover") {
            let estoque = lerEstoque();
            const dados = estoque[categoria];
            const totalItens = (dados.contas || dados.codigos || dados.cartoes || []).length;
            
            delete estoque[categoria];
            salvarEstoque(estoque);
            
            await logAdmin(interaction.client, interaction.user, `Removeu a categoria **${categoria}** com ${totalItens} item(s).`, '/estoque');
            
            await interaction.update({ 
                content: `✅ **Categoria removida com sucesso!**\n\n🗑️ **${categoria}** foi removida do estoque (${totalItens} item(s) deletados).`, 
                components: [], 
                embeds: [] 
            });
            
            return interaction.followUp({ 
                content: '📊 **Painel atualizado:**', 
                embeds: [criarEmbedEstoque(lerEstoque())], 
                components: criarBotoesPainel(), 
                ephemeral: true 
            });
        }
    },

    async handleModal(interaction) {
        const action = interaction.customId.split(':')[1];
        await interaction.deferReply({ ephemeral: true });
        let estoque = lerEstoque();

        try {
            if (action === "modal_steam") {
                const saldo = interaction.fields.getTextInputValue("saldo").trim();
                const preco = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));
                const contasTexto = interaction.fields.getTextInputValue("contas").trim();
                
                if (isNaN(preco) || preco <= 0) {
                    return interaction.editReply({ content: "❌ Preço inválido! Use formato: 25.50" });
                }
                
                const categoria = `STEAM-${saldo}`;
                const linhas = contasTexto.split("\n").filter(Boolean);
                
                if (!estoque[categoria]) {
                    estoque[categoria] = { contas: [], preco: preco };
                } else {
                    estoque[categoria].preco = preco;
                    if (!estoque[categoria].contas) estoque[categoria].contas = [];
                }
                
                let adicionadas = 0;
                linhas.forEach(linha => {
                    const [loginSenha, email_link] = linha.split("|");
                    if (loginSenha && email_link) {
                        const [login, senha] = loginSenha.split(":");
                        if (login && senha) {
                            estoque[categoria].contas.push({ 
                                login: login.trim(), 
                                senha: senha.trim(), 
                                email_link: email_link.trim() 
                            });
                            adicionadas++;
                        }
                    }
                });
                
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Adicionou ${adicionadas} contas Steam R$ ${saldo} por R$ ${preco.toFixed(2)} cada.`, '/estoque');
                await interaction.editReply({ 
                    content: `✅ **Steam adicionada com sucesso!**\n\n🎮 **Steam R$ ${saldo}**\n💰 Preço: R$ ${preco.toFixed(2)}\n📦 Contas adicionadas: ${adicionadas}` 
                });
            }

            else if (action === "modal_roblox") {
                const tipo = interaction.fields.getTextInputValue("tipo").trim();
                const preco = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));
                const contasTexto = interaction.fields.getTextInputValue("contas").trim();
                
                if (isNaN(preco) || preco <= 0) {
                    return interaction.editReply({ content: "❌ Preço inválido! Use formato: 15.00" });
                }
                
                const categoria = `ROBLOX-${tipo}`;
                const linhas = contasTexto.split("\n").filter(Boolean);
                
                if (!estoque[categoria]) {
                    estoque[categoria] = { contas: [], preco: preco };
                } else {
                    estoque[categoria].preco = preco;
                    if (!estoque[categoria].contas) estoque[categoria].contas = [];
                }
                
                let adicionadas = 0;
                linhas.forEach(linha => {
                    const [login, senha] = linha.split(":");
                    if (login && senha) {
                        estoque[categoria].contas.push({ 
                            login: login.trim(), 
                            senha: senha.trim() 
                        });
                        adicionadas++;
                    }
                });
                
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Adicionou ${adicionadas} contas Roblox ${tipo} por R$ ${preco.toFixed(2)} cada.`, '/estoque');
                await interaction.editReply({ 
                    content: `✅ **Roblox adicionado com sucesso!**\n\n🕹️ **Roblox ${tipo}**\n💰 Preço: R$ ${preco.toFixed(2)}\n📦 Contas adicionadas: ${adicionadas}` 
                });
            }

            else if (action === "modal_giftcard") {
                const plataforma = interaction.fields.getTextInputValue("plataforma").trim();
                const preco = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));
                const codigosTexto = interaction.fields.getTextInputValue("codigos").trim();
                
                if (isNaN(preco) || preco <= 0) {
                    return interaction.editReply({ content: "❌ Preço inválido! Use formato: 20.00" });
                }
                
                const categoria = `GIFTCARD-${plataforma}`;
                const linhas = codigosTexto.split("\n").filter(Boolean);
                
                if (!estoque[categoria]) {
                    estoque[categoria] = { codigos: [], preco: preco };
                } else {
                    estoque[categoria].preco = preco;
                    if (!estoque[categoria].codigos) estoque[categoria].codigos = [];
                }
                
                linhas.forEach(codigo => {
                    estoque[categoria].codigos.push(codigo.trim());
                });
                
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Adicionou ${linhas.length} gift cards ${plataforma} por R$ ${preco.toFixed(2)} cada.`, '/estoque');
                await interaction.editReply({ 
                    content: `✅ **Gift Cards adicionados com sucesso!**\n\n🎁 **Gift ${plataforma}**\n💰 Preço: R$ ${preco.toFixed(2)}\n📦 Códigos adicionados: ${linhas.length}` 
                });
            }

            else if (action === "modal_cartoes") {
                const categoria = interaction.fields.getTextInputValue("categoria").trim().toLowerCase();
                const preco = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));
                const cartoesTexto = interaction.fields.getTextInputValue("cartoes").trim();
                
                if (isNaN(preco) || preco <= 0) {
                    return interaction.editReply({ content: "❌ Preço inválido! Use formato: 40.00" });
                }
                
                const linhas = cartoesTexto.split("\n").filter(Boolean);
                
                if (!estoque[categoria]) {
                    estoque[categoria] = { cartoes: [], preco: preco };
                } else {
                    estoque[categoria].preco = preco;
                    if (!estoque[categoria].cartoes) estoque[categoria].cartoes = [];
                }
                
                linhas.forEach(cartao => {
                    estoque[categoria].cartoes.push(cartao.trim());
                });
                
                salvarEstoque(estoque);
                await logAdmin(interaction.client, interaction.user, `Adicionou ${linhas.length} cartões ${categoria} por R$ ${preco.toFixed(2)} cada.`, '/estoque');
                await interaction.editReply({ 
                    content: `✅ **Cartões adicionados com sucesso!**\n\n💳 **${categoria.charAt(0).toUpperCase() + categoria.slice(1)}**\n💰 Preço: R$ ${preco.toFixed(2)}\n📦 Cartões adicionados: ${linhas.length}` 
                });
            }

            else if (action === "modal_preco") {
                const categoria = interaction.fields.getTextInputValue("categoria_hidden").trim();
                const precoNum = parseFloat(interaction.fields.getTextInputValue("preco").trim().replace(',', '.'));

                if (isNaN(precoNum) || precoNum <= 0) {
                    return interaction.editReply({ content: "❌ Valor de preço inválido! Use formato: 25.50" });
                }
                
                if (!estoque[categoria]) {
                    return interaction.editReply({ content: "❌ Categoria não encontrada!" });
                }
                
                const precoAntigo = estoque[categoria].preco;
                estoque[categoria].preco = precoNum;
                salvarEstoque(estoque);
                
                await logAdmin(interaction.client, interaction.user, `Alterou preço da categoria **${categoria}** de R$ ${precoAntigo?.toFixed(2) || '0.00'} para R$ ${precoNum.toFixed(2)}.`, '/estoque');
                await interaction.editReply({ 
                    content: `✅ **Preço atualizado!**\n\n📦 **${categoria}**\n💰 Preço anterior: R$ ${precoAntigo?.toFixed(2) || '0.00'}\n💰 Novo preço: **R$ ${precoNum.toFixed(2)}**` 
                });
            }

            return interaction.followUp({ 
                content: '📊 **Painel atualizado:**', 
                embeds: [criarEmbedEstoque(lerEstoque())], 
                components: criarBotoesPainel(), 
                ephemeral: true 
            });

        } catch (e) {
            console.error("Erro no modal de estoque:", e);
            await interaction.editReply({ content: "❌ Ocorreu um erro ao processar sua solicitação. Verifique o formato dos dados." });
        }
    }
};