const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ChannelType,
    Colors,
    AttachmentBuilder,
} = require("discord.js");

// --- SERVIÇOS E UTILITÁRIOS ---
const { createPixPayment: criarPagamento, getPaymentStatus: verificarPagamento } = require("../services/zeroone");
const { consultarCpf, gerarCpf } = require("../services/magmaapi");
const { lerEstoque, transformarEstoqueNovo, filtrarCartoes, removerItemDoEstoque } = require("../utils/estoque");
const { logPagamento } = require("../utils/logger");
const config = require("../config.json");
const fs = require('fs');
const path = require('path');

// --- CONTROLE DE ESTADO GLOBAL ---
const pesquisasPendentes = new Map();
const pagamentosPendentes = new Map();
const trocasAtivas = new Map();
// Novo sistema de memória para trocas à prova de falhas
const comprasRecentesParaTroca = new Map();

// Limpeza automática da memória de trocas
setInterval(() => {
    const agora = Date.now();
    const DEZ_MINUTOS = 10 * 60 * 1000;
    for (const [userId, compras] of comprasRecentesParaTroca.entries()) {
        const comprasValidas = compras.filter(compra => (agora - compra.timestamp) < DEZ_MINUTOS);
        if (comprasValidas.length > 0) {
            comprasRecentesParaTroca.set(userId, comprasValidas);
        } else {
            comprasRecentesParaTroca.delete(userId);
        }
    }
}, 5 * 60 * 1000);


// ==================================================================================
// FUNÇÕES AUXILIARES E DE LÓGICA
// ==================================================================================

function isSteamCategory(catName) { const upper = catName.toUpperCase(); return upper === 'STEAM' || upper.startsWith('STEAM-'); }
function isRobloxCategory(catName) { const upper = catName.toUpperCase(); return upper === 'ROBLOX' || upper.startsWith('ROBLOX-'); }
function isGiftcardCategory(catName) { const upper = catName.toUpperCase().trim(); return upper.includes('GIFTCARD'); }
function isAccountCategory(catName) { return isSteamCategory(catName) || isRobloxCategory(catName); }

async function buscarCpfValidoEmLoop(maxTentativas = 15) { for (let i = 0; i < maxTentativas; i++) { const cpf = gerarCpf(); const resultado = await consultarCpf(cpf).catch(() => null); if (resultado && !resultado.error) return resultado; await new Promise(resolve => setTimeout(resolve, 300)); } return { error: 'NOT_FOUND_IN_LOOP' }; }
async function darCargoComprador(interaction) { try { const member = await interaction.guild.members.fetch(interaction.user.id); const roleId = config.cargoCompradorID; if (roleId && member && !member.roles.cache.has(roleId)) { await member.roles.add(roleId); } } catch (e) { console.error("Erro ao adicionar cargo de comprador:", e); } }
function usuarioTemCompraPendente(userId) { return Array.from(pagamentosPendentes.values()).some(p => p.userId === userId && !p.pago); }
function primeiros6(numero) { return (numero || "").slice(0, 6); }
function criarPainelCheckout(status, dados) { const { item, valorPagamento } = dados; const expiraEmTimestamp = Math.floor((Date.now() + 15 * 60 * 1000) / 1000); let nomeProduto; switch (item.tipo) { case 'steam': nomeProduto = `Conta Steam (${item.categoria.replace(/^STEAM-?/i, '') || 'Padrão'})`; break; case 'roblox': nomeProduto = `Conta Roblox (${item.categoria.replace(/^ROBLOX-?/i, '') || 'Padrão'})`; break; case 'giftcard': nomeProduto = `Gift Card (${item.categoria.replace(/^GIFTCARD-?/i, '') || 'Padrão'})`; break; default: nomeProduto = `Cartão ${item.level || item.categoria}`; break; } const embeds = { pendente: new EmbedBuilder().setColor(Colors.Yellow).setTitle(`⏳ Checkout Iniciado`).addFields({ name: "📦 Produto", value: nomeProduto, inline: true },{ name: "💰 Valor a Pagar", value: `R$ ${valorPagamento.toFixed(2).replace('.', ',')}`, inline: true },{ name: "⌛ Expira em", value: `<t:${expiraEmTimestamp}:R>`, inline: true }).setFooter({ text: "Escaneie o QR Code para pagar." }).setImage('attachment://qrcode.png'), processando: new EmbedBuilder().setColor(Colors.Blue).setTitle("✅ Pagamento Aprovado! Processando...").setDescription(`Seu pagamento foi confirmado! Estamos preparando seu produto: **${nomeProduto}**.`), sucesso: new EmbedBuilder().setColor(Colors.Green).setTitle("✨ Compra Finalizada com Sucesso!").setDescription("Seu produto foi entregue! **Verifique sua Mensagem Direta (DM)** para ver os detalhes."), falha: new EmbedBuilder().setColor(Colors.Red).setTitle("❌ Pagamento Expirado ou Cancelado").setDescription("O tempo para pagamento esgotou ou a compra foi cancelada."), }; return embeds[status]; }

// ==================================================================================
// LÓGICA PRINCIPAL DO COMANDO E INTERAÇÕES
// ==================================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("painel")
        .setDescription("Envia o painel de compras no canal.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const embedComprar = new EmbedBuilder().setTitle("Bem-vindo à Legacy CC's").setDescription(`👏 | Pioneiros na venda de produtos digitais de alta qualidade.\n💳 | Material de alta qualidade a preços acessíveis.\n👨‍💻 | Produtos verificados no momento da compra.\n👍 | Garantia de cartões live, com troca em até 10 minutos.\n\n🎖 | Nossas referências: <#1375627890556801109>\n💬 | Precisa de ajuda? Abra um <#1375627890556801108>`).setColor("#8a00ff").setImage("https://media.discordapp.net/attachments/1376705206913339493/1381768329890496732/tabela_01.png").setFooter({ text: "ESTOQUE ATUALIZADO — COMPRE AGORA E GARANTA RESULTADOS", });
        const rowComprar = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("painel:abrir_compras").setLabel("🛒 Comprar").setStyle(ButtonStyle.Success), 
            new ButtonBuilder().setCustomId("painel:termos_troca").setLabel("📜 Termos de Troca").setStyle(ButtonStyle.Secondary), 
            new ButtonBuilder().setCustomId("painel:abrir_troca").setLabel("🔁 Solicitar Troca").setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embedComprar], components: [rowComprar] });
        await interaction.reply({ content: "✅ Painel de compra enviado!", ephemeral: true });
    },

    async handleButton(interaction) {
        const [commandName, action, ...rest] = interaction.customId.split(':');

        if (action === "abrir_compras") {
            const requiredRoleId = config.cargoAcessoID;
            if (requiredRoleId && !interaction.member.roles.cache.has(requiredRoleId)) {
                return interaction.reply({ content: `❌ Você não possui o cargo necessário para acessar a área de compras. Se verifique em <#1375631946549301308> para poder comprar`, ephemeral: true });
            }

            const estoque = lerEstoque();
            const categoriasSteam = [], categoriasRoblox = [], categoriasGiftcard = [], categoriasCartoes = [];
            for (const cat of Object.keys(estoque)) {
                const item = estoque[cat];
                if (!item || !item.preco || item.preco <= 0) continue;
                if (isSteamCategory(cat) && item.contas?.length > 0) categoriasSteam.push(cat);
                else if (isRobloxCategory(cat) && item.contas?.length > 0) categoriasRoblox.push(cat);
                else if (isGiftcardCategory(cat) && item.codigos?.length > 0) categoriasGiftcard.push(cat);
                else if (item.cartoes?.length > 0 && !isAccountCategory(cat) && !isGiftcardCategory(cat)) categoriasCartoes.push(cat);
            }
            
            const temCartoes = categoriasCartoes.length > 0;
            const temSteam = categoriasSteam.length > 0;
            const temRoblox = categoriasRoblox.length > 0;
            const temGiftcard = categoriasGiftcard.length > 0;

            if (!temCartoes && !temSteam && !temRoblox && !temGiftcard) {
                return interaction.reply({ content: "❌ No momento, nosso estoque está completamente vazio ou os preços não foram definidos. Tente novamente mais tarde.", ephemeral: true });
            }
            
            const embedPesquisa = new EmbedBuilder().setColor("#8a00ff").setTitle("🛒 Painel de Compras").setThumbnail("https://media.discordapp.net/attachments/1376759989749813298/1378876103019597874/photo_2025-05-23_19.12.42.jpeg").setDescription("> Bem-vindo(a) à nossa loja! Aqui você encontra os melhores produtos digitais com entrega automática.\n\n**Escolha uma opção nos menus abaixo para começar.**").setTimestamp().setFooter({ text: "Qualidade e segurança em primeiro lugar" });
            
            const fields = [];
            if (temCartoes) fields.push({ name: '💳 Cartões de Crédito', value: 'Use o menu para pesquisar ou comprar cartões de nossas melhores categorias.', inline: true });
            if (temSteam) fields.push({ name: '🎮 Contas Steam', value: 'Contas com saldo prontas para uso. Veja as opções no menu.', inline: true });
            if (temRoblox) fields.push({ name: '🕹️ Contas Roblox', value: 'Contas raras e exclusivas. Escolha a sua no menu dedicado.', inline: true });
            if (temGiftcard) fields.push({ name: '🎁 Gift Cards', value: 'Créditos para diversas plataformas. Compre pelo menu.', inline: true });
            if(fields.length > 0) embedPesquisa.addFields(fields);
            
            const components = [];

            if (temCartoes) {
                const menuCartoes = new StringSelectMenuBuilder().setCustomId("painel:menu_pesquisa_cartao").setPlaceholder("💳 Ações de Cartão de Crédito...").addOptions([{ label: "Pesquisar por BIN", value: "pesquisar_bin", emoji: "🔢" }, { label: "Pesquisar por Banco", value: "pesquisar_banco", emoji: "🏦" }, { label: "Pesquisar por Bandeira", value: "pesquisar_bandeira", emoji: "🌎" }, { label: "Pesquisar por Level", value: "pesquisar_level", emoji: "🥇" }, { label: "Comprar Unitária (Aleatória)", value: "unitarias", emoji: "💳" }]);
                components.push(new ActionRowBuilder().addComponents(menuCartoes));
            }
            if (temSteam) {
                const menuSteam = new StringSelectMenuBuilder().setCustomId("painel:selecionar_steam").setPlaceholder("🎮 Comprar Conta Steam...").addOptions(categoriasSteam.map(cat => ({ label: `Conta Saldo R$ ${cat.replace(/^STEAM-?/i, '') || 'Padrão'}`, description: `Preço: R$ ${estoque[cat].preco.toFixed(2).replace('.', ',')}`, value: cat })));
                components.push(new ActionRowBuilder().addComponents(menuSteam));
            }
            if (temRoblox) {
                const menuRoblox = new StringSelectMenuBuilder().setCustomId("painel:selecionar_roblox").setPlaceholder("🕹️ Comprar Conta Roblox...").addOptions(categoriasRoblox.map(cat => ({ label: `Conta ${cat.replace(/^ROBLOX-?/i, '') || 'Padrão'}`, description: `Preço: R$ ${estoque[cat].preco.toFixed(2).replace('.', ',')}`, value: cat })));
                components.push(new ActionRowBuilder().addComponents(menuRoblox));
            }
            if (temGiftcard) {
                const menuGiftcard = new StringSelectMenuBuilder().setCustomId("painel:selecionar_giftcard").setPlaceholder("🎁 Comprar Gift Card...").addOptions(categoriasGiftcard.map(cat => ({ label: `Gift Card ${cat.replace(/^GIFTCARD-?/i, '') || 'Padrão'}`, description: `Preço: R$ ${estoque[cat].preco.toFixed(2).replace('.', ',')}`, value: cat })));
                components.push(new ActionRowBuilder().addComponents(menuGiftcard));
            }
            
            return interaction.reply({ embeds: [embedPesquisa], components, ephemeral: true });
        }
        
        if (action === "termos_troca") {
            const embed = new EmbedBuilder().setTitle("📜 Termos de Troca & Garantia").setDescription(`Você precisa enviar um vídeo mostrando:\n• A data e hora no site da Magalu ou Tramontina;\n• A tentativa de compra de um produto até R$150;\n• Tudo isso dentro do prazo de **10 minutos** após a liberação da info.\n\n**Importante:**\n\nSe o vídeo ou o contato não forem enviados dentro do prazo, **não será feita a troca**.\nCompre apenas se estiver de acordo com estas condições!`).setColor(Colors.DarkGrey);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (action === "abrir_troca") {
            await interaction.deferReply({ ephemeral: true });
            
            const comprasDoUsuario = comprasRecentesParaTroca.get(interaction.user.id) || [];
            const agora = Date.now();
            const DEZ_MINUTOS = 10 * 60 * 1000;
            const comprasValidas = comprasDoUsuario.filter(c => (agora - c.timestamp) < DEZ_MINUTOS);

            if (comprasValidas.length === 0) {
                return interaction.editReply({ content: "Não encontrei nenhuma compra de **cartão** sua nos últimos 10 minutos que seja elegível para troca." });
            }

            const menu = new StringSelectMenuBuilder()
                .setCustomId('painel:selecionar_troca')
                .setPlaceholder('Selecione o cartão que deseja trocar')
                .addOptions(comprasValidas.map(compra => ({
                    label: `Final ${compra.cartao.slice(-4)} (${compra.categoria})`,
                    description: `Comprado em: ${new Date(compra.timestamp).toLocaleTimeString('pt-BR')}`,
                    value: `${compra.cartao}:${compra.categoria}`
                })));
            
            return interaction.editReply({ content: "Encontrei suas compras recentes de cartões. Por favor, selecione qual você deseja solicitar a troca:", components: [new ActionRowBuilder().addComponents(menu)] });
        }

        if (action === 'checkout') {
            const [subAction, paymentId] = rest;
            const ctx = pagamentosPendentes.get(paymentId);
            if (!ctx) return interaction.reply({ content: "Este checkout é antigo ou inválido.", ephemeral: true });
            if (subAction === 'copiar-pix') return interaction.reply({ content: ctx.pixCopyPaste, ephemeral: true });
            if (subAction === 'cancelar') {
                clearTimeout(ctx.timeoutId);
                pagamentosPendentes.delete(paymentId);
                await logPagamento(interaction.client, "cancelamento", interaction.user, { motivo: "Usuário cancelou a compra", valor: ctx.valorPagamento });
                return interaction.update({ embeds: [criarPainelCheckout('falha', ctx)], components: [] });
            }
        }

        if (action === 'troca') {
            const [subAction, channelId] = rest;
            const ctx = trocasAtivas.get(channelId);
            if (!ctx) return interaction.reply({ content: "Este ticket de troca é antigo ou inválido.", ephemeral: true });
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: "Apenas administradores podem executar esta ação.", ephemeral: true });
            
            const adminUser = interaction.user;
            await interaction.update({ content: `Ação executada por ${adminUser}. Processando...`, components: [], embeds: [] });
            
            if (subAction === 'aprovar') {
                const novoCartao = transformarEstoqueNovo(lerEstoque()).find(c => c.categoria === ctx.categoria && c.numero !== ctx.cartao);
                if (!novoCartao) {
                    return interaction.followUp({ content: `❌ Não foi encontrado um cartão da categoria **${ctx.categoria}** para a troca.`, ephemeral: true });
                }

                removerItemDoEstoque('cartao', novoCartao.categoria, novoCartao.numero);
                const resultadoApi = await buscarCpfValidoEmLoop(15);
                const dadosFinais = { ...novoCartao, ...resultadoApi };

                const prazoDeTrocaTimestamp = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
                const deliveryMessage = `> Sua troca foi aprovada! ✅\n\n` + `**Seu novo cartão:**\n\`\`\`${dadosFinais.numero}|${dadosFinais.mes}/${dadosFinais.ano}|${dadosFinais.cvv}\`\`\`\n` + `**Nome:** \`${dadosFinais.nome}\`\n` + `**CPF:** \`${dadosFinais.cpf}\`\n` + `**Data de Nasc.:** \`${dadosFinais.nascimento || 'N/D'}\`\n` + `**Nome da Mãe:** \`${dadosFinais.mae || 'N/D'}\`\n\n` + `**Detalhes:** ${dadosFinais.bandeira}, ${dadosFinais.banco}, ${dadosFinais.level}.\n\n` + `> ⚠️ **Atenção:** Você tem até <t:${prazoDeTrocaTimestamp}:F> (<t:${prazoDeTrocaTimestamp}:R>) para solicitar uma nova troca, caso este também não funcione.`;

                try {
                    await interaction.client.users.send(ctx.userId, { content: deliveryMessage });
                } catch (e) {
                    await interaction.channel.send({ content: `<@${ctx.userId}>, não consegui te enviar o novo cartão na DM! Ele segue aqui: \n${deliveryMessage}` });
                }
                await logPagamento(interaction.client, "info", adminUser, { info: `Troca aprovada para ${ctx.userTag}. Cartão antigo: ${ctx.cartao}. Novo: ${novoCartao.numero}` });
            }
            
            const closeReason = subAction === 'aprovar' ? 'Troca finalizada.' : (subAction === 'negar' ? 'Troca negada.' : 'Ticket fechado manualmente.');
            await interaction.channel.send(`${closeReason} Este canal será fechado em 20 segundos.`);
            setTimeout(() => interaction.channel.delete().catch(console.error), 20000);
            trocasAtivas.delete(channelId);
        }
    },

    async handleSelectMenu(interaction) {
        const [commandName, action] = interaction.customId.split(':');
        const estoque = lerEstoque();
        const categoria = interaction.values[0];

        const checkoutActions = ['selecionar_steam', 'selecionar_roblox', 'selecionar_giftcard', 'unitarias_categoria', 'selecionar_cartao'];
        if (checkoutActions.includes(action)) {
            if (usuarioTemCompraPendente(interaction.user.id)) return interaction.reply({ content: "Você já possui uma compra pendente! Finalize-a ou aguarde expirar.", ephemeral: true });

            await interaction.deferUpdate();

            try {
                let item, valorPagamento;
                
                if (action === 'selecionar_steam' || action === 'selecionar_roblox' || action === 'selecionar_giftcard') {
                    const tipo = action.split('_')[1];
                    const estoqueCategoria = estoque[categoria];
                    const itensDisponiveis = tipo === 'giftcard' ? estoqueCategoria?.codigos : estoqueCategoria?.contas;
                    
                    if (!itensDisponiveis || itensDisponiveis.length === 0) { return interaction.editReply({ content: `❌ Esgotado! Esta categoria de ${tipo} não tem mais estoque.`, embeds: [], components:[] }); }
                    
                    const preco = estoqueCategoria?.preco;
                    if (!preco || preco <= 0) { return interaction.editReply({ content: "❌ O preço para esta categoria não foi definido ou é inválido. Contate um admin.", embeds: [], components:[] }); }

                    const itemEscolhido = itensDisponiveis[Math.floor(Math.random() * itensDisponiveis.length)];
                    item = (typeof itemEscolhido === 'object') ? { ...itemEscolhido, tipo, categoria } : { codigo: itemEscolhido, tipo, categoria };
                    valorPagamento = preco;

                } else {
                    let catCartao;
                    if (action === 'unitarias_categoria') {
                        catCartao = categoria;
                        const cards = estoque[catCartao]?.cartoes || [];
                        if (!cards.length) return interaction.editReply({ content: "❌ Esgotado!", embeds: [], components:[] });
                        item = transformarEstoqueNovo({ [catCartao]: { cartoes: [cards[Math.floor(Math.random() * cards.length)]], preco: estoque[catCartao].preco } })[0];
                    } else { 
                        const index = parseInt(interaction.values[0], 10); 
                        const pendente = pesquisasPendentes.get(interaction.user.id);
                        if (!pendente?.resultados?.[index]) return interaction.editReply({ content: "Seleção inválida.", embeds: [], components:[] });
                        item = pendente.resultados[index];
                    }
                    item.tipo = 'cartao';
                    valorPagamento = parseFloat(String(item.preco || '40').replace(',', '.'));
                }
                
                const nomeProduto = criarPainelCheckout('pendente', { item, valorPagamento }).data.fields[0].value;
                await logPagamento(interaction.client, "compra", interaction.user, { tipo: item.tipo, produto: nomeProduto, valor: valorPagamento });
                const response = await criarPagamento(valorPagamento, nomeProduto);
                if (!response?.id) throw new Error('Resposta da API de pagamento inválida.');
                const paymentId = String(response.id);
                const tempDir = path.join(__dirname, '..', 'temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
                const qrCodePath = path.join(tempDir, `${paymentId}_qrcode.png`);
                fs.writeFileSync(qrCodePath, response.pixUrl.replace('data:image/png;base64,', ''), 'base64');
                const checkoutData = { item, valorPagamento, userId: interaction.user.id };
                const painelPendente = criarPainelCheckout('pendente', checkoutData);
                const rowPendente = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`painel:checkout:copiar-pix:${paymentId}`).setLabel("Copiar PIX").setStyle(ButtonStyle.Success).setEmoji("📋"), new ButtonBuilder().setCustomId(`painel:checkout:cancelar:${paymentId}`).setLabel("Cancelar").setStyle(ButtonStyle.Danger).setEmoji("✖️"));
                await interaction.editReply({ embeds: [painelPendente], components: [rowPendente], files: [new AttachmentBuilder(qrCodePath, { name: 'qrcode.png' })] });
                fs.unlinkSync(qrCodePath);
                const timeoutId = setTimeout(() => { const ctx = pagamentosPendentes.get(paymentId); if (ctx && !ctx.pago) { interaction.editReply({ embeds: [criarPainelCheckout('falha', ctx)], components: [] }).catch(() => {}); pagamentosPendentes.delete(paymentId); } }, 15 * 60 * 1000);
                pagamentosPendentes.set(paymentId, { ...checkoutData, pixCopyPaste: response.pixCopyPaste, pago: false, timeoutId });

                const checarPagamento = async (tentativas = 0) => {
                    if (tentativas > 45 || !pagamentosPendentes.has(paymentId)) return;
                    const paymentDetails = await verificarPagamento(paymentId).catch(() => null);
                    const ctx = pagamentosPendentes.get(paymentId);
                    if (!ctx || ctx.pago) return;

                    if (paymentDetails && paymentDetails.status === 'APPROVED') {
                        clearTimeout(ctx.timeoutId);
                        ctx.pago = true;
                        await interaction.editReply({ embeds: [criarPainelCheckout('processando', ctx)], components: [], files: [] }).catch(() => {});
                        let deliveryMessage, logIdentifier, logProduto;
                        
                        switch(ctx.item.tipo) {
                            case 'steam':
                                deliveryMessage = `> Compra aprovada! ✅\n\n` + `**Sua Conta Steam:**\n\`\`\`${ctx.item.login}\`\`\`\n` + `**Link para o Email:**\n${ctx.item.email_link}\n\n` + `> ⚠️ **Atenção:** Use o link para acessar o e-mail e alterar os dados da conta o mais rápido possível. Não oferecemos garantia após a entrega.`;
                                logIdentifier = ctx.item.login;
                                logProduto = `Conta Steam (${ctx.item.categoria})`;
                                removerItemDoEstoque(ctx.item.tipo, ctx.item.categoria, ctx.item.login);
                                break;
                            case 'roblox':
                                deliveryMessage = `> Compra aprovada! ✅\n\n` + `**Sua Conta Roblox:**\nLogin: \`${ctx.item.login}\`\nSenha: \`${ctx.item.senha}\`\n\n` + `> ⚠️ **Atenção:** Altere a senha da conta o mais rápido possível. Não oferecemos garantia após a entrega.`;
                                logIdentifier = ctx.item.login;
                                logProduto = `Conta Roblox (${ctx.item.categoria})`;
                                removerItemDoEstoque(ctx.item.tipo, ctx.item.categoria, ctx.item.login);
                                break;
                            case 'giftcard':
                                deliveryMessage = `> Compra aprovada! ✅\n\n` + `**Seu código Gift Card:**\n\`\`\`${ctx.item.codigo}\`\`\``;
                                logIdentifier = ctx.item.codigo;
                                logProduto = `Gift Card (${ctx.item.categoria})`;
                                removerItemDoEstoque(ctx.item.tipo, ctx.item.categoria, ctx.item.codigo);
                                break;
                            default: 
                                const resultadoApi = await buscarCpfValidoEmLoop(15);
                                const dadosFinais = { ...ctx.item, ...resultadoApi };
                                const prazoDeTrocaTimestamp = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
                                deliveryMessage = `> Compra aprovada! ✅\n\n` + `**Seu cartão:**\n\`\`\`${dadosFinais.numero}|${dadosFinais.mes}/${dadosFinais.ano}|${dadosFinais.cvv}\`\`\`\n` + `**Nome:** \`${dadosFinais.nome}\`\n` + `**CPF:** \`${dadosFinais.cpf}\`\n` + `**Data de Nasc.:** \`${dadosFinais.nascimento || 'N/D'}\`\n` + `**Nome da Mãe:** \`${dadosFinais.mae || 'N/D'}\`\n\n` + `**Detalhes:** ${dadosFinais.bandeira}, ${dadosFinais.banco}, ${dadosFinais.level}.\n\n` + `> ⚠️ **Atenção:** Você tem até <t:${prazoDeTrocaTimestamp}:F> (<t:${prazoDeTrocaTimestamp}:R>) para solicitar a troca do cartão, caso ele não funcione.`;
                                logIdentifier = dadosFinais.numero;
                                logProduto = `Cartão ${ctx.item.categoria}`;
                                removerItemDoEstoque('cartao', ctx.item.categoria, ctx.item.numero);
                                
                                const compraParaTroca = { cartao: dadosFinais.numero, categoria: ctx.item.categoria, timestamp: Date.now() };
                                const comprasDoUsuario = comprasRecentesParaTroca.get(ctx.userId) || [];
                                comprasDoUsuario.push(compraParaTroca);
                                comprasRecentesParaTroca.set(ctx.userId, comprasDoUsuario);
                                break;
                        }
                        
                        await darCargoComprador(interaction);
                        await logPagamento(interaction.client, "pagamento_confirmado", interaction.user, { valor: ctx.valorPagamento, categoria: logProduto, item: logIdentifier });

                        try {
                            await interaction.user.send({ content: deliveryMessage });
                            await interaction.editReply({ embeds: [criarPainelCheckout('sucesso', ctx)] }).catch(() => {});
                        } catch (dmError) {
                            const embedFalhaDM = new EmbedBuilder().setColor(Colors.Orange).setTitle("⚠️ Falha ao Enviar DM").setDescription("Não consegui te enviar os detalhes do produto. Aqui estão eles:").addFields({ name: 'Dados do Produto', value: deliveryMessage });
                            await interaction.editReply({ embeds: [criarPainelCheckout('sucesso', ctx), embedFalhaDM] }).catch(() => {});
                        }
                        pagamentosPendentes.delete(paymentId);
                    } else {
                        setTimeout(() => checarPagamento(tentativas + 1), 4000);
                    }
                };
                setTimeout(() => checarPagamento(), 4000);

            } catch (err) {
                console.error("ERRO CRÍTICO NO CHECKOUT:", err);
                await logPagamento(interaction.client, "erro", interaction.user, { motivo: `Erro no checkout: ${err.message}` });
                await interaction.editReply({ content: "❌ Ocorreu um erro crítico ao gerar o seu pagamento. A equipe já foi notificada.", embeds: [], components: [], files: [] }).catch(() => {});
            }
        }
        
        if (action === 'selecionar_troca') {
            await interaction.deferReply({ ephemeral: true });
            const [cartao, catTroca] = interaction.values[0].split(':');
            const user = interaction.user;
            const channelName = `troca-${user.id}`;
            if (interaction.guild.channels.cache.some(c => c.name === channelName && c.parentId === config.categoriaTrocaID)) return interaction.editReply({ content: 'Você já possui um ticket de troca aberto.' });
            const permissions = [{ id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },{ id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }];
            if (config.cargoAdminID) { permissions.push({ id: config.cargoAdminID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }); }
            const canal = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: config.categoriaTrocaID, topic: `Troca para ${user.tag} | Cartão: ${cartao}`, permissionOverwrites: permissions });
            trocasAtivas.set(canal.id, { channelId: canal.id, userId: user.id, userTag: user.tag, cartao, categoria: catTroca });
            const embedCliente = new EmbedBuilder().setColor("#8a00ff").setTitle("🔁 Pedido de Troca Iniciado").setThumbnail(user.displayAvatarURL()).setDescription(`Olá <@${user.id}>, seu ticket foi aberto.`).addFields({ name: "💳 Cartão para Troca", value: `Final \`${cartao.slice(-4)}\` (Categoria: ${catTroca})` }, { name: "❗ Próximo Passo", value: "Por favor, **anexe aqui o vídeo** mostrando o teste do cartão, conforme os termos." });
            const rowAdmin = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`painel:troca:aprovar:${canal.id}`).setLabel("Aprovar").setStyle(ButtonStyle.Success).setEmoji("✅"), new ButtonBuilder().setCustomId(`painel:troca:negar:${canal.id}`).setLabel("Negar").setStyle(ButtonStyle.Danger).setEmoji("❌"), new ButtonBuilder().setCustomId(`painel:troca:fechar:${canal.id}`).setLabel("Fechar").setStyle(ButtonStyle.Secondary).setEmoji("🔒"));
            await canal.send({ content: `<@${user.id}>, <@&${config.cargoAdminID}>`, embeds: [embedCliente], components: [rowAdmin] });
            return interaction.editReply({ content: `✅ Seu ticket de troca foi aberto em <#${canal.id}>.` });
        }

        if (action === 'menu_pesquisa_cartao') {
             if (["pesquisar_bin", "pesquisar_banco", "pesquisar_bandeira", "pesquisar_level"].includes(categoria)) {
                const modal = new ModalBuilder().setCustomId(`painel:modal_busca:${categoria}`).setTitle("🔍 Pesquisa Detalhada");
                const labels = { "pesquisar_bin": "Digite o BIN (6 dígitos)", "pesquisar_banco": "Digite o nome do banco", "pesquisar_bandeira": "Digite a bandeira", "pesquisar_level": "Digite o level" };
                const input = new TextInputBuilder().setCustomId("input_busca").setLabel(labels[categoria]).setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
            if (categoria === 'unitarias') {
                const categoriasDeCartoes = Object.keys(estoque).filter(cat => { const item = estoque[cat]; return item && item.cartoes?.length > 0 && !isAccountCategory(cat) && !isGiftcardCategory(cat) && item.preco > 0; });
                if (!categoriasDeCartoes.length) { return interaction.update({ content: "❌ Desculpe, não há categorias de cartões unitários disponíveis no momento.", embeds: [interaction.message.embeds[0]], components: [] }); }
                const menuCategorias = new StringSelectMenuBuilder().setCustomId("painel:unitarias_categoria").setPlaceholder("Selecione a categoria de CC desejada").addOptions(categoriasDeCartoes.map(cat => ({ label: cat.charAt(0).toUpperCase() + cat.slice(1), value: cat, description: `Preço: R$ ${estoque[cat].preco.toFixed(2).replace('.', ',')}` })));
                const newComponents = [new ActionRowBuilder().addComponents(menuCategorias)];
                interaction.message.components.slice(1).forEach(row => newComponents.push(row));
                return interaction.update({ embeds: interaction.message.embeds, components: newComponents });
            }
        }
    },

    async handleModal(interaction) {
        const customIdParts = interaction.customId.split(':');
        const commandName = customIdParts[0];
        const action = customIdParts[1];
        if (commandName === 'painel' && action === 'modal_busca') {
            try {
                const tipoBusca = customIdParts[2];
                const valorBusca = interaction.fields.getTextInputValue("input_busca").trim();
                const campo = ({ pesquisar_bin: "numero", pesquisar_banco: "banco", pesquisar_bandeira: "bandeira", pesquisar_level: "level" })[tipoBusca];
                const estoqueDeCartoes = transformarEstoqueNovo(lerEstoque());
                if (!estoqueDeCartoes.length) { return interaction.reply({ content: "❌ Nenhum cartão disponível no estoque para pesquisa.", ephemeral: true }); }
                const resultados = filtrarCartoes(campo, valorBusca, estoqueDeCartoes);
                if (!resultados.length) { return interaction.reply({ content: `Nenhum cartão encontrado com esses parâmetros para: **${valorBusca}**`, ephemeral: true }); }
                pesquisasPendentes.set(interaction.user.id, { resultados });
                const formatarPrecoSeguro = (preco) => { const numPreco = parseFloat(preco); if (!isNaN(numPreco) && numPreco > 0) { return `R$ ${numPreco.toFixed(2).replace('.', ',')}`; } return "N/A"; };
                const descricoes = resultados.slice(0, 25).map((cartao, i) => { const precoFormatado = formatarPrecoSeguro(cartao.preco); return `\`${i}\` - **${primeiros6(cartao.numero)}** | ${cartao.banco || "N/D"} | ${cartao.level || "N/D"} - **${precoFormatado}**`; });
                const embedResultados = new EmbedBuilder().setTitle("💳 RESULTADOS DA PESQUISA").setDescription(descricoes.join("\n")).setColor("#8a00ff").setFooter({ text: "Selecione o cartão que deseja comprar." });
                const selectOptions = resultados.slice(0, 25).map((cartao, index) => ({ label: `${primeiros6(cartao.numero)} - ${cartao.banco || "N/D"}`, description: `Level: ${cartao.level || "N/D"} | Preço: ${formatarPrecoSeguro(cartao.preco)}`, value: String(index) }));
                const selectCartoes = new StringSelectMenuBuilder().setCustomId("painel:selecionar_cartao").setPlaceholder("Selecione um cartão para comprar").addOptions(selectOptions);
                return interaction.reply({ embeds: [embedResultados], components: [new ActionRowBuilder().addComponents(selectCartoes)], ephemeral: true });
            } catch (err) {
                console.error("ERRO AO PROCESSAR MODAL DE BUSCA:", err);
                if (!interaction.replied) { await interaction.reply({ content: "Ocorreu um erro inesperado ao processar a busca.", ephemeral: true }); }
            }
        }
    },
};