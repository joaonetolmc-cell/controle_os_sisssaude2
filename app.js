/* ========================================================
   CONTROLE DE ORDEM DE SERVIÇO - SISS
   Script Principal (app.js)
   JavaScript puro, sem dependências de frameworks.
   Gerencia CRUD de OS, Responsáveis, Gráficos em Canvas,
   Tabela filtrável, Kanban (4 colunas), Exportações e Backup.
   ======================================================== */

(function () {
    'use strict';

    // ========================================================
    // 1. CONSTANTES E CONFIGURAÇÕES
    // ========================================================
    const CHAVE_STORAGE_ORDENS = 'siss_ordens';
    const CHAVE_STORAGE_RESPONSAVEIS = 'siss_responsaveis';

    const STATUS_LISTA = ['Aberta', 'Pendente', 'Andamento', 'Teste', 'Concluída'];
    const STATUS_KANBAN = ['Aberta', 'Pendente', 'Andamento', 'Teste'];
    const TIPOS_LISTA = ['Crítica', 'Prioridade Alta', 'Prioridade Média', 'Melhoria'];
    const VERSOES_LISTA = ['V2 SISS Hospitalar', 'V5 SISS Hospitalar'];
    const AMBIENTES_LISTA = ['Homolog', 'Produção'];

    const CORES_STATUS = {
        'Aberta': '#1a73e8',
        'Pendente': '#e8710a',
        'Andamento': '#9334e6',
        'Teste': '#12a4a0',
        'Concluída': '#1e8e3e'
    };

    const CORES_TIPO = {
        'Crítica': '#d93025',
        'Prioridade Alta': '#e8710a',
        'Prioridade Média': '#f29900',
        'Melhoria': '#1e8e3e'
    };

    // Estado da aplicação
    let osSendoVisualizadaId = null;
    let acaoConfirmacaoCallback = null;
    let timerToast = null;

    // ========================================================
    // 2. ARMAZENAMENTO (localStorage)
    // ========================================================

    // Carrega ordens de serviço do localStorage
    function carregarOrdens() {
        try {
            const raw = localStorage.getItem(CHAVE_STORAGE_ORDENS);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Erro ao ler ordens do localStorage:', e);
            return [];
        }
    }

    // Salva ordens no localStorage
    function salvarOrdens(ordens) {
        try {
            localStorage.setItem(CHAVE_STORAGE_ORDENS, JSON.stringify(ordens));
        } catch (e) {
            console.error('Erro ao salvar ordens:', e);
            mostrarToast('Erro ao salvar ordens no armazenamento local.', 'erro');
        }
    }

    // Carrega responsáveis cadastrados
    function carregarResponsaveis() {
        try {
            const raw = localStorage.getItem(CHAVE_STORAGE_RESPONSAVEIS);
            if (!raw) {
                // Lista inicial padrão se nunca cadastrado
                const padrao = ['João Silva', 'Maria Santos', 'Carlos Oliveira'];
                salvarResponsaveis(padrao);
                return padrao;
            }
            return JSON.parse(raw);
        } catch (e) {
            console.error('Erro ao ler responsáveis:', e);
            return [];
        }
    }

    // Salva responsáveis no localStorage
    function salvarResponsaveis(lista) {
        try {
            localStorage.setItem(CHAVE_STORAGE_RESPONSAVEIS, JSON.stringify(lista));
        } catch (e) {
            console.error('Erro ao salvar responsáveis:', e);
        }
    }

    // Busca OS por ID
    function obterOSPorId(id) {
        const ordens = carregarOrdens();
        return ordens.find(os => String(os.id) === String(id));
    }

    // ========================================================
    // 3. UTILITÁRIOS E FORMATAÇÃO
    // ========================================================

    // Escapa HTML para prevenir ataques XSS
    function escaparHTML(texto) {
        if (texto === null || texto === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(texto);
        return div.innerHTML;
    }

    // Formata data ISO para pt-BR completa (dd/mm/aaaa hh:mm)
    function formatarDataHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        }) + ' ' + d.toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });
    }

    // Formata valor para input datetime-local (aaaa-mm-ddThh:mm)
    function formatarParaInputDateTime(data) {
        const d = data instanceof Date ? data : new Date(data);
        if (isNaN(d.getTime())) return '';
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        const hora = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${ano}-${mes}-${dia}T${hora}:${min}`;
    }

    // Formata milissegundos em texto "Xd Xh Xmin"
    function formatarDuracao(ms) {
        if (ms < 0) ms = 0;
        const totalMin = Math.floor(ms / 60000);
        const minutos = totalMin % 60;
        const totalHoras = Math.floor(totalMin / 60);
        const horas = totalHoras % 24;
        const dias = Math.floor(totalHoras / 24);

        const partes = [];
        if (dias > 0) partes.push(dias + (dias === 1 ? ' dia' : ' dias'));
        if (horas > 0 || dias > 0) partes.push(horas + (horas === 1 ? ' hora' : ' horas'));
        partes.push(minutos + (minutos === 1 ? ' minuto' : ' minutos'));
        return partes.join(', ');
    }

    // Exibe notificação temporária toast
    function mostrarToast(mensagem, tipo = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = mensagem;
        toast.className = `toast ${tipo}`;
        if (timerToast) clearTimeout(timerToast);
        timerToast = setTimeout(() => {
            toast.classList.add('oculto');
        }, 3600);
    }

    // Retorna classe CSS para o badge de tipo
    function obterClasseTipoBadge(tipo) {
        if (tipo === 'Crítica') return 'badge-tipo-Critica';
        if (tipo === 'Prioridade Alta') return 'badge-tipo-Alta';
        if (tipo === 'Prioridade Média') return 'badge-tipo-Media';
        if (tipo === 'Melhoria') return 'badge-tipo-Melhoria';
        return '';
    }

    // ========================================================
    // 4. NAVEGAÇÃO EM ABAS
    // ========================================================
    function inicializarNavegacao() {
        const botoes = document.querySelectorAll('.aba-btn');
        botoes.forEach(btn => {
            btn.addEventListener('click', () => {
                const aba = btn.getAttribute('data-aba');
                ativarAba(aba);
            });
        });
    }

    function ativarAba(nomeAba) {
        document.querySelectorAll('.aba-btn').forEach(btn => {
            const ehAtiva = btn.getAttribute('data-aba') === nomeAba;
            btn.classList.toggle('ativa', ehAtiva);
            if (ehAtiva) btn.setAttribute('aria-current', 'page');
            else btn.removeAttribute('aria-current');
        });

        document.getElementById('secao-principal').classList.toggle('oculto', nomeAba !== 'principal');
        document.getElementById('secao-kanban').classList.toggle('oculto', nomeAba !== 'kanban');
        document.getElementById('secao-configuracoes').classList.toggle('oculto', nomeAba !== 'configuracoes');

        if (nomeAba === 'principal') {
            renderizarPrincipal();
        } else if (nomeAba === 'kanban') {
            renderizarKanban();
        } else if (nomeAba === 'configuracoes') {
            renderizarConfiguracoes();
        }
    }

    // ========================================================
    // 5. TELA PRINCIPAL (DASHBOARD + TABELA)
    // ========================================================

    function renderizarPrincipal() {
        const ordens = carregarOrdens();
        renderizarCards(ordens);
        renderizarGraficos(ordens);
        atualizarOpcoesFiltrosTabela(ordens);
        renderizarTabela();
    }

    // a) Cards com total de OS e por status
    function renderizarCards(ordens) {
        const container = document.getElementById('cards-resumo');
        if (!container) return;

        const contagens = { Total: ordens.length };
        STATUS_LISTA.forEach(s => contagens[s] = 0);
        ordens.forEach(os => {
            if (contagens[os.status] !== undefined) contagens[os.status]++;
        });

        const cardsConfig = [
            { id: 'Total', rotulo: 'Total de OS', classe: 'card-total' },
            { id: 'Aberta', rotulo: 'Aberta', classe: 'card-aberta' },
            { id: 'Pendente', rotulo: 'Pendente', classe: 'card-pendente' },
            { id: 'Andamento', rotulo: 'Andamento', classe: 'card-andamento' },
            { id: 'Teste', rotulo: 'Teste', classe: 'card-teste' },
            { id: 'Concluída', rotulo: 'Concluída', classe: 'card-concluida' }
        ];

        let html = '';
        cardsConfig.forEach(c => {
            html += `
                <div class="card-item ${c.classe}">
                    <div class="card-numero">${contagens[c.id]}</div>
                    <div class="card-rotulo">${c.rotulo}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // b) Gráficos em Canvas com mensagem "Sem dados para exibir"
    function renderizarGraficos(ordens) {
        // 1. Quantidade de OS por status (todas as OS)
        const dadosStatus = STATUS_LISTA.map(s => {
            return { rotulo: s, valor: ordens.filter(os => os.status === s).length, cor: CORES_STATUS[s] };
        });
        desenharGraficoBarrasSimples('grafico-status', 'vazio-status', dadosStatus);

        // 2. Quantidade de OS por tipo (todas as OS)
        const dadosTipo = TIPOS_LISTA.map(t => {
            return { rotulo: t, valor: ordens.filter(os => os.tipo === t).length, cor: CORES_TIPO[t] };
        });
        desenharGraficoBarrasSimples('grafico-tipo', 'vazio-tipo', dadosTipo);

        // Filtro de OS ABERTAS: não estão Concluídas
        const osAbertas = ordens.filter(os => os.status !== 'Concluída');

        // 3. Gráfico de barras agrupadas: OS abertas por versão (Homolog e Produção)
        desenharGraficoVersaoAmbiente('grafico-versao', 'vazio-versao', osAbertas);

        // 4. Quantidade de OS abertas por módulo
        desenharGraficoModulos('grafico-modulo', 'vazio-modulo', osAbertas);
    }

    // Gráfico de barras simples
    function desenharGraficoBarrasSimples(canvasId, vazioId, itens) {
        const canvas = document.getElementById(canvasId);
        const msgVazio = document.getElementById(vazioId);
        if (!canvas) return;

        const total = itens.reduce((s, i) => s + i.valor, 0);
        if (total === 0) {
            canvas.classList.add('oculto');
            msgVazio.classList.remove('oculto');
            return;
        }
        canvas.classList.remove('oculto');
        msgVazio.classList.add('oculto');

        const ctx = canvas.getContext('2d');
        const largura = canvas.width;
        const altura = canvas.height;
        ctx.clearRect(0, 0, largura, altura);

        const margemEsq = 36;
        const margemDir = 16;
        const margemTopo = 24;
        const margemBaixo = 42;
        const areaW = largura - margemEsq - margemDir;
        const areaH = altura - margemTopo - margemBaixo;

        const maxVal = Math.max(...itens.map(i => i.valor), 1);
        const passoX = areaW / itens.length;
        const larguraBarra = Math.min(passoX * 0.55, 46);

        // Linhas de grade horizontais
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#5f6368';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';

        const numLinhas = 3;
        for (let l = 0; l <= numLinhas; l++) {
            const y = margemTopo + areaH - (areaH / numLinhas) * l;
            const val = Math.round((maxVal / numLinhas) * l);
            ctx.beginPath();
            ctx.moveTo(margemEsq, y);
            ctx.lineTo(largura - margemDir, y);
            ctx.stroke();
            ctx.fillText(String(val), margemEsq - 6, y + 4);
        }

        // Barras
        itens.forEach((item, idx) => {
            const x = margemEsq + passoX * idx + (passoX - larguraBarra) / 2;
            const hBarra = (item.valor / maxVal) * areaH;
            const y = margemTopo + areaH - hBarra;

            ctx.fillStyle = item.cor;
            ctx.fillRect(x, y, larguraBarra, hBarra);

            // Valor sobre a barra
            ctx.fillStyle = '#202124';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(item.valor), x + larguraBarra / 2, y - 5);

            // Rótulo abaixo
            ctx.fillStyle = '#5f6368';
            ctx.font = '10px sans-serif';
            const rotuloCurto = item.rotulo.length > 12 ? item.rotulo.substring(0, 11) + '…' : item.rotulo;
            ctx.fillText(rotuloCurto, x + larguraBarra / 2, altura - margemBaixo + 16);
        });
    }

    // Gráfico de barras agrupadas: Versão x Ambiente (Homolog e Produção) para OS Abertas
    function desenharGraficoVersaoAmbiente(canvasId, vazioId, osAbertas) {
        const canvas = document.getElementById(canvasId);
        const msgVazio = document.getElementById(vazioId);
        if (!canvas) return;

        if (osAbertas.length === 0) {
            canvas.classList.add('oculto');
            msgVazio.classList.remove('oculto');
            return;
        }
        canvas.classList.remove('oculto');
        msgVazio.classList.add('oculto');

        const ctx = canvas.getContext('2d');
        const largura = canvas.width;
        const altura = canvas.height;
        ctx.clearRect(0, 0, largura, altura);

        const dados = VERSOES_LISTA.map(versao => {
            const homolog = osAbertas.filter(os => os.versao === versao && os.ambiente === 'Homolog').length;
            const producao = osAbertas.filter(os => os.versao === versao && os.ambiente === 'Produção').length;
            return { versao: versao === 'V2 SISS Hospitalar' ? 'V2 Hosp.' : 'V5 Hosp.', homolog, producao };
        });

        const margemEsq = 36;
        const margemDir = 16;
        const margemTopo = 30;
        const margemBaixo = 40;
        const areaW = largura - margemEsq - margemDir;
        const areaH = altura - margemTopo - margemBaixo;

        const maxVal = Math.max(...dados.flatMap(d => [d.homolog, d.producao]), 1);

        // Legenda no topo
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        // Homolog
        ctx.fillStyle = '#1a73e8';
        ctx.fillRect(largura - 170, 10, 12, 10);
        ctx.fillStyle = '#202124';
        ctx.fillText('Homolog', largura - 154, 19);
        // Produção
        ctx.fillStyle = '#e8710a';
        ctx.fillRect(largura - 90, 10, 12, 10);
        ctx.fillStyle = '#202124';
        ctx.fillText('Produção', largura - 74, 19);

        // Linhas horizontais
        ctx.strokeStyle = '#e8eaed';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#5f6368';
        ctx.textAlign = 'right';
        for (let l = 0; l <= 3; l++) {
            const y = margemTopo + areaH - (areaH / 3) * l;
            const val = Math.round((maxVal / 3) * l);
            ctx.beginPath();
            ctx.moveTo(margemEsq, y);
            ctx.lineTo(largura - margemDir, y);
            ctx.stroke();
            ctx.fillText(String(val), margemEsq - 6, y + 4);
        }

        const passoGrupo = areaW / dados.length;
        const largBarra = Math.min(passoGrupo * 0.28, 36);

        dados.forEach((d, idx) => {
            const centroX = margemEsq + passoGrupo * idx + passoGrupo / 2;

            // Barra Homolog
            const xH = centroX - largBarra - 3;
            const hH = (d.homolog / maxVal) * areaH;
            const yH = margemTopo + areaH - hH;
            ctx.fillStyle = '#1a73e8';
            ctx.fillRect(xH, yH, largBarra, hH);
            ctx.fillStyle = '#202124';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(d.homolog), xH + largBarra / 2, yH - 4);

            // Barra Produção
            const xP = centroX + 3;
            const hP = (d.producao / maxVal) * areaH;
            const yP = margemTopo + areaH - hP;
            ctx.fillStyle = '#e8710a';
            ctx.fillRect(xP, yP, largBarra, hP);
            ctx.fillStyle = '#202124';
            ctx.fillText(String(d.producao), xP + largBarra / 2, yP - 4);

            // Rótulo da Versão
            ctx.fillStyle = '#5f6368';
            ctx.font = '11px sans-serif';
            ctx.fillText(d.versao, centroX, altura - margemBaixo + 18);
        });
    }

    // Gráfico de OS abertas por módulo
    function desenharGraficoModulos(canvasId, vazioId, osAbertas) {
        const canvas = document.getElementById(canvasId);
        const msgVazio = document.getElementById(vazioId);
        if (!canvas) return;

        if (osAbertas.length === 0) {
            canvas.classList.add('oculto');
            msgVazio.classList.remove('oculto');
            return;
        }

        // Agrupa por módulo
        const contagemModulos = {};
        osAbertas.forEach(os => {
            const m = (os.modulo && os.modulo.trim()) ? os.modulo.trim() : 'Não informado';
            contagemModulos[m] = (contagemModulos[m] || 0) + 1;
        });

        // Top módulos
        const itens = Object.keys(contagemModulos)
            .map(m => ({ rotulo: m, valor: contagemModulos[m], cor: '#12a4a0' }))
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 6);

        if (itens.length === 0) {
            canvas.classList.add('oculto');
            msgVazio.classList.remove('oculto');
            return;
        }

        desenharGraficoBarrasSimples(canvasId, vazioId, itens);
    }

    // ========================================================
    // 6. FILTROS E TABELA DE ORDENS DE SERVIÇO
    // ========================================================

    // Atualiza opções dos selects dinâmicos de filtro (Módulo e Responsável)
    function atualizarOpcoesFiltrosTabela(ordens) {
        // Módulos
        const modulosSet = new Set();
        ordens.forEach(os => {
            if (os.modulo && os.modulo.trim()) modulosSet.add(os.modulo.trim());
        });

        const selectModuloTab = document.getElementById('filtro-tab-modulo');
        const selectModuloKan = document.getElementById('filtro-kan-modulo');
        const valorAtualTab = selectModuloTab.value;
        const valorAtualKan = selectModuloKan.value;

        let htmlModulos = '<option value="">Todos</option>';
        Array.from(modulosSet).sort().forEach(m => {
            htmlModulos += `<option value="${escaparHTML(m)}">${escaparHTML(m)}</option>`;
        });
        htmlModulos += '<option value="__SEM_VALOR__">Não informado</option>';

        selectModuloTab.innerHTML = htmlModulos;
        selectModuloKan.innerHTML = htmlModulos;
        selectModuloTab.value = valorAtualTab;
        selectModuloKan.value = valorAtualKan;

        // Responsáveis
        const responsaveisCadastrados = carregarResponsaveis();
        const respSet = new Set(responsaveisCadastrados);
        ordens.forEach(os => {
            if (os.responsavel && os.responsavel.trim()) respSet.add(os.responsavel.trim());
        });

        const selectRespTab = document.getElementById('filtro-tab-responsavel');
        const selectRespKan = document.getElementById('filtro-kan-responsavel');
        const valorAtualRespTab = selectRespTab.value;
        const valorAtualRespKan = selectRespKan.value;

        let htmlResp = '<option value="">Todos</option>';
        Array.from(respSet).sort().forEach(r => {
            htmlResp += `<option value="${escaparHTML(r)}">${escaparHTML(r)}</option>`;
        });
        htmlResp += '<option value="__SEM_VALOR__">Não informado</option>';

        selectRespTab.innerHTML = htmlResp;
        selectRespKan.innerHTML = htmlResp;
        selectRespTab.value = valorAtualRespTab;
        selectRespKan.value = valorAtualRespKan;

        // Atualiza datalist de sugestão de módulos no modal de cadastro
        const datalist = document.getElementById('sugestoes-modulos');
        if (datalist) {
            datalist.innerHTML = Array.from(modulosSet).sort()
                .map(m => `<option value="${escaparHTML(m)}"></option>`)
                .join('');
        }
    }

    // Aplica os filtros da tabela
    function obterOrdensFiltradasTabela() {
        const ordens = carregarOrdens();

        const fStatus = document.getElementById('filtro-tab-status').value;
        const fTipo = document.getElementById('filtro-tab-tipo').value;
        const fVersao = document.getElementById('filtro-tab-versao').value;
        const fAmbiente = document.getElementById('filtro-tab-ambiente').value;
        const fModulo = document.getElementById('filtro-tab-modulo').value;
        const fResp = document.getElementById('filtro-tab-responsavel').value;
        const fBusca = document.getElementById('filtro-tab-busca').value.toLowerCase().trim();

        // Ordenação: da mais recente para a mais antiga (pela data de abertura)
        const ordenadas = ordens.slice().sort((a, b) => {
            const dataA = new Date(a.dataAbertura || 0).getTime();
            const dataB = new Date(b.dataAbertura || 0).getTime();
            return dataB - dataA;
        });

        return ordenadas.filter(os => {
            if (fStatus && os.status !== fStatus) return false;
            if (fTipo && os.tipo !== fTipo) return false;

            // Versão (trata dados antigos vazios)
            if (fVersao) {
                if (fVersao === '__SEM_VALOR__') {
                    if (os.versao && os.versao.trim()) return false;
                } else if (os.versao !== fVersao) {
                    return false;
                }
            }

            // Ambiente
            if (fAmbiente) {
                if (fAmbiente === '__SEM_VALOR__') {
                    if (os.ambiente && os.ambiente.trim()) return false;
                } else if (os.ambiente !== fAmbiente) {
                    return false;
                }
            }

            // Módulo
            if (fModulo) {
                if (fModulo === '__SEM_VALOR__') {
                    if (os.modulo && os.modulo.trim()) return false;
                } else if ((os.modulo || '').trim() !== fModulo) {
                    return false;
                }
            }

            // Responsável
            if (fResp) {
                if (fResp === '__SEM_VALOR__') {
                    if (os.responsavel && os.responsavel.trim()) return false;
                } else if ((os.responsavel || '').trim() !== fResp) {
                    return false;
                }
            }

            // Busca por texto (descrição ou Nº Azure)
            if (fBusca) {
                const desc = (os.descricao || '').toLowerCase();
                const az = (os.azure || '').toLowerCase();
                if (!desc.includes(fBusca) && !az.includes(fBusca)) {
                    return false;
                }
            }

            return true;
        });
    }

    // Renderiza a tabela principal
    function renderizarTabela() {
        const corpo = document.getElementById('tabela-os-corpo');
        const contador = document.getElementById('contador-tabela');
        const msgVazia = document.getElementById('tabela-vazia');
        if (!corpo) return;

        const lista = obterOrdensFiltradasTabela();
        contador.textContent = `${lista.length} OS`;

        if (lista.length === 0) {
            corpo.innerHTML = '';
            msgVazia.classList.remove('oculto');
            return;
        }

        msgVazia.classList.add('oculto');
        let html = '';

        lista.forEach(os => {
            const azureTxt = os.azure && os.azure.trim() ? escaparHTML(os.azure.trim()) : '—';
            const moduloTxt = os.modulo && os.modulo.trim() ? escaparHTML(os.modulo.trim()) : '<span class="texto-nao-informado">Não informado</span>';
            const versaoTxt = os.versao && os.versao.trim() ? escaparHTML(os.versao.trim()) : '<span class="texto-nao-informado">Não informado</span>';
            const ambienteTxt = os.ambiente && os.ambiente.trim() ? escaparHTML(os.ambiente.trim()) : '<span class="texto-nao-informado">Não informado</span>';
            const respTxt = os.responsavel && os.responsavel.trim() ? escaparHTML(os.responsavel.trim()) : '<span class="texto-nao-informado">Não informado</span>';

            const classeTipo = obterClasseTipoBadge(os.tipo);

            html += `
                <tr>
                    <td><strong>${azureTxt}</strong></td>
                    <td class="col-descricao" title="${escaparHTML(os.descricao)}">${escaparHTML(os.descricao)}</td>
                    <td><span class="badge ${classeTipo}">${escaparHTML(os.tipo)}</span></td>
                    <td><span class="badge badge-status-${escaparHTML(os.status)}">${escaparHTML(os.status)}</span></td>
                    <td>${moduloTxt}</td>
                    <td>${versaoTxt}</td>
                    <td>${ambienteTxt}</td>
                    <td>${respTxt}</td>
                    <td>${formatarDataHora(os.dataAbertura)}</td>
                    <td class="col-acao">
                        <button type="button" class="btn btn-secundario btn-pequeno btn-abrir-detalhes" data-id="${os.id}">Detalhes</button>
                    </td>
                </tr>
            `;
        });

        corpo.innerHTML = html;

        // Eventos dos botões "Detalhes"
        corpo.querySelectorAll('.btn-abrir-detalhes').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                abrirModalDetalhes(id);
            });
        });
    }

    // ========================================================
    // 7. KANBAN (4 COLUNAS: Aberta, Pendente, Andamento, Teste)
    // ========================================================

    function obterOrdensFiltradasKanban() {
        const ordens = carregarOrdens();

        const fTipo = document.getElementById('filtro-kan-tipo').value;
        const fVersao = document.getElementById('filtro-kan-versao').value;
        const fAmbiente = document.getElementById('filtro-kan-ambiente').value;
        const fModulo = document.getElementById('filtro-kan-modulo').value;
        const fResp = document.getElementById('filtro-kan-responsavel').value;
        const fBusca = document.getElementById('filtro-kan-busca').value.toLowerCase().trim();

        // Não inclui Concluída no Kanban
        return ordens.filter(os => {
            if (os.status === 'Concluída') return false;
            if (fTipo && os.tipo !== fTipo) return false;

            if (fVersao) {
                if (fVersao === '__SEM_VALOR__') {
                    if (os.versao && os.versao.trim()) return false;
                } else if (os.versao !== fVersao) return false;
            }

            if (fAmbiente) {
                if (fAmbiente === '__SEM_VALOR__') {
                    if (os.ambiente && os.ambiente.trim()) return false;
                } else if (os.ambiente !== fAmbiente) return false;
            }

            if (fModulo) {
                if (fModulo === '__SEM_VALOR__') {
                    if (os.modulo && os.modulo.trim()) return false;
                } else if ((os.modulo || '').trim() !== fModulo) return false;
            }

            if (fResp) {
                if (fResp === '__SEM_VALOR__') {
                    if (os.responsavel && os.responsavel.trim()) return false;
                } else if ((os.responsavel || '').trim() !== fResp) return false;
            }

            if (fBusca) {
                const desc = (os.descricao || '').toLowerCase();
                const az = (os.azure || '').toLowerCase();
                if (!desc.includes(fBusca) && !az.includes(fBusca)) return false;
            }

            return true;
        });
    }

    function renderizarKanban() {
        const ordens = obterOrdensFiltradasKanban();

        STATUS_KANBAN.forEach(status => {
            const listaEl = document.querySelector(`.kanban-cartoes-lista[data-status="${status}"]`);
            const badgeCont = document.getElementById(`cont-kanban-${status}`);
            if (!listaEl) return;

            const osDoStatus = ordens.filter(os => os.status === status);
            if (badgeCont) badgeCont.textContent = `(${osDoStatus.length})`;

            let html = '';
            osDoStatus.forEach(os => {
                const azureTxt = os.azure && os.azure.trim() ? '#' + escaparHTML(os.azure.trim()) : 'Sem nº';
                const classeBorda = `cartao-borda-${os.tipo === 'Prioridade Alta' ? 'Alta' : os.tipo === 'Prioridade Média' ? 'Media' : os.tipo === 'Crítica' ? 'Critica' : 'Melhoria'}`;
                const classeBadgeTipo = obterClasseTipoBadge(os.tipo);

                const moduloTxt = os.modulo && os.modulo.trim() ? escaparHTML(os.modulo.trim()) : 'Não informado';
                const versaoTxt = os.versao && os.versao.trim() ? (os.versao.includes('V2') ? 'V2' : 'V5') : '—';
                const ambienteTxt = os.ambiente && os.ambiente.trim() ? escaparHTML(os.ambiente.trim()) : '—';

                html += `
                    <div class="kanban-cartao ${classeBorda}" draggable="true" data-id="${os.id}" tabindex="0" role="button" aria-label="OS ${azureTxt}">
                        <div class="cartao-topo">
                            <span class="cartao-azure">${azureTxt}</span>
                            <span class="badge ${classeBadgeTipo}">${escaparHTML(os.tipo)}</span>
                        </div>
                        <div class="cartao-descricao" title="${escaparHTML(os.descricao)}">${escaparHTML(os.descricao)}</div>
                        <div class="cartao-meta">
                            <span><strong>Módulo:</strong> ${moduloTxt}</span>
                            <span><strong>Versão/Amb:</strong> ${versaoTxt} / ${ambienteTxt}</span>
                        </div>
                        <div class="cartao-acoes">
                            <button type="button" class="btn-mover-cartao" data-id="${os.id}">Mover</button>
                        </div>
                    </div>
                `;
            });

            listaEl.innerHTML = html;
        });

        configurarDragAndDropKanban();
        configurarEventosCartoesKanban();
    }

    // Configura Drag and Drop (HTML5) entre colunas do Kanban
    function configurarDragAndDropKanban() {
        const cartoes = document.querySelectorAll('.kanban-cartao');
        const colunas = document.querySelectorAll('.kanban-coluna');

        cartoes.forEach(cartao => {
            cartao.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', cartao.getAttribute('data-id'));
                e.dataTransfer.effectAllowed = 'move';
                cartao.classList.add('arrastando');
            });

            cartao.addEventListener('dragend', () => {
                cartao.classList.remove('arrastando');
                colunas.forEach(col => col.classList.remove('drag-sobre'));
            });
        });

        colunas.forEach(col => {
            col.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                col.classList.add('drag-sobre');
            });

            col.addEventListener('dragleave', (e) => {
                if (!col.contains(e.relatedTarget)) {
                    col.classList.remove('drag-sobre');
                }
            });

            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drag-sobre');
                const osId = e.dataTransfer.getData('text/plain');
                const novoStatus = col.getAttribute('data-status');
                if (osId && novoStatus) {
                    mudarStatusOS(osId, novoStatus);
                }
            });
        });
    }

    // Configura cliques e botão "Mover" nos cartões
    function configurarEventosCartoesKanban() {
        document.querySelectorAll('.kanban-cartao').forEach(cartao => {
            const id = cartao.getAttribute('data-id');

            // Clique no cartão abre detalhes
            cartao.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-mover-cartao')) return;
                abrirModalDetalhes(id);
            });

            // Teclado (Enter ou Espaço)
            cartao.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.target.classList.contains('btn-mover-cartao')) return;
                    e.preventDefault();
                    abrirModalDetalhes(id);
                }
            });
        });

        // Botão "Mover" para celular ou alternativa
        document.querySelectorAll('.btn-mover-cartao').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                abrirModalMoverStatus(id);
            });
        });
    }

    // Altera o status da OS e adiciona evento ao histórico
    function mudarStatusOS(id, novoStatus) {
        const ordens = carregarOrdens();
        const os = ordens.find(o => String(o.id) === String(id));
        if (!os) return;

        if (os.status === novoStatus) return; // Sem alteração

        const agoraIso = new Date().toISOString();
        os.status = novoStatus;

        if (!Array.isArray(os.historico)) {
            os.historico = [{ status: novoStatus, dataHora: os.dataAbertura || agoraIso }];
        }

        os.historico.push({
            status: novoStatus,
            dataHora: agoraIso
        });

        salvarOrdens(ordens);
        mostrarToast(`Status alterado para "${novoStatus}".`, 'sucesso');
        atualizarTudo();
    }

    // Modal para mover status (útil para toque no celular)
    function abrirModalMoverStatus(id) {
        const os = obterOSPorId(id);
        if (!os) return;

        document.getElementById('mover-os-descricao').textContent = `OS #${os.azure || 'Sem nº'}: ${os.descricao}`;
        const container = document.getElementById('mover-opcoes-status');

        let html = '';
        STATUS_LISTA.forEach(s => {
            const ehAtual = s === os.status;
            html += `
                <button type="button" class="btn-status-opcao" data-status="${s}" ${ehAtual ? 'disabled style="opacity:0.5;"' : ''}>
                    ${s} ${ehAtual ? '(Atual)' : ''}
                </button>
            `;
        });
        container.innerHTML = html;

        container.querySelectorAll('.btn-status-opcao').forEach(btn => {
            btn.addEventListener('click', () => {
                const statusDestino = btn.getAttribute('data-status');
                fecharModal('modal-mover');
                mudarStatusOS(id, statusDestino);
            });
        });

        abrirModal('modal-mover');
    }

    // ========================================================
    // 8. FORMULÁRIO DE CADASTRO / EDIÇÃO DE OS
    // ========================================================

    function abrirModalNovaOS() {
        const responsaveis = carregarResponsaveis();
        const alertaSemResp = document.getElementById('alerta-sem-responsaveis');
        const selectResp = document.getElementById('campo-responsavel');

        // Preenche select de responsáveis
        popularSelectResponsaveis(selectResp, responsaveis, '');

        if (responsaveis.length === 0) {
            alertaSemResp.classList.remove('oculto');
        } else {
            alertaSemResp.classList.add('oculto');
        }

        document.getElementById('modal-os-titulo').textContent = 'Nova Ordem de Serviço';
        document.getElementById('form-os').reset();
        document.getElementById('form-os-id').value = '';
        document.getElementById('campo-status').value = 'Aberta';

        // Preenche data/hora atual
        const agora = new Date();
        document.getElementById('campo-data-abertura').value = formatarParaInputDateTime(agora);
        verificarDataRetroativa();

        limparErrosFormulario();
        abrirModal('modal-os');
    }

    function abrirModalEditarOS(id) {
        const os = obterOSPorId(id);
        if (!os) return;

        const responsaveis = carregarResponsaveis();
        const selectResp = document.getElementById('campo-responsavel');
        popularSelectResponsaveis(selectResp, responsaveis, os.responsavel || '');

        document.getElementById('alerta-sem-responsaveis').classList.add('oculto');
        document.getElementById('modal-os-titulo').textContent = 'Editar Ordem de Serviço';
        document.getElementById('form-os-id').value = os.id;
        document.getElementById('campo-descricao').value = os.descricao || '';
        document.getElementById('campo-tipo').value = os.tipo || '';
        document.getElementById('campo-status').value = os.status || 'Aberta';
        document.getElementById('campo-azure').value = os.azure || '';
        document.getElementById('campo-modulo').value = os.modulo || '';
        document.getElementById('campo-versao').value = os.versao || '';
        document.getElementById('campo-ambiente').value = os.ambiente || '';
        document.getElementById('campo-data-abertura').value = formatarParaInputDateTime(os.dataAbertura);

        limparErrosFormulario();
        verificarDataRetroativa();
        abrirModal('modal-os');
    }

    function popularSelectResponsaveis(selectEl, lista, selecionado) {
        let html = '<option value="">Selecione o responsável...</option>';
        lista.forEach(r => {
            const sel = r === selecionado ? 'selected' : '';
            html += `<option value="${escaparHTML(r)}" ${sel}>${escaparHTML(r)}</option>`;
        });
        // Se a OS antiga tiver um responsável que foi excluído da lista, mantém ele como opção
        if (selecionado && !lista.includes(selecionado)) {
            html += `<option value="${escaparHTML(selecionado)}" selected>${escaparHTML(selecionado)} (Antigo)</option>`;
        }
        selectEl.innerHTML = html;
    }

    function verificarDataRetroativa() {
        const campoData = document.getElementById('campo-data-abertura');
        const aviso = document.getElementById('aviso-data-retroativa');
        if (!campoData.value) {
            aviso.classList.add('oculto');
            return;
        }

        const dataInf = new Date(campoData.value).getTime();
        const agora = new Date().getTime();
        // Diferença maior que 3 minutos para trás considera retroativa
        if (agora - dataInf > 3 * 60 * 1000) {
            aviso.classList.remove('oculto');
        } else {
            aviso.classList.add('oculto');
        }
    }

    function limparErrosFormulario() {
        document.querySelectorAll('.erro-campo').forEach(el => el.textContent = '');
        document.querySelectorAll('.invalido').forEach(el => el.classList.remove('invalido'));
    }

    function exibirErroCampo(idCampo, idErro, mensagem) {
        const campo = document.getElementById(idCampo);
        const erro = document.getElementById(idErro);
        if (campo) campo.classList.add('invalido');
        if (erro) erro.textContent = mensagem;
    }

    // Salvar formulário de OS com validações completas
    function salvarFormularioOS(e) {
        e.preventDefault();
        limparErrosFormulario();

        const idEdicao = document.getElementById('form-os-id').value;
        const descricao = document.getElementById('campo-descricao').value.trim();
        const tipo = document.getElementById('campo-tipo').value;
        const status = document.getElementById('campo-status').value;
        const azure = document.getElementById('campo-azure').value.trim();
        const modulo = document.getElementById('campo-modulo').value.trim();
        const versao = document.getElementById('campo-versao').value;
        const ambiente = document.getElementById('campo-ambiente').value;
        const responsavel = document.getElementById('campo-responsavel').value;
        const dataAberturaStr = document.getElementById('campo-data-abertura').value;

        let valido = true;

        if (!descricao) {
            exibirErroCampo('campo-descricao', 'erro-descricao', 'A descrição da OS é obrigatória.');
            valido = false;
        }

        if (!tipo) {
            exibirErroCampo('campo-tipo', 'erro-tipo', 'Selecione o tipo da OS.');
            valido = false;
        }

        if (!status) {
            exibirErroCampo('campo-status', 'erro-status', 'Selecione o status.');
            valido = false;
        }

        if (!modulo) {
            exibirErroCampo('campo-modulo', 'erro-modulo', 'O módulo é obrigatório.');
            valido = false;
        }

        if (!versao) {
            exibirErroCampo('campo-versao', 'erro-versao', 'Selecione a versão.');
            valido = false;
        }

        if (!ambiente) {
            exibirErroCampo('campo-ambiente', 'erro-ambiente', 'Selecione o ambiente.');
            valido = false;
        }

        if (!responsavel) {
            exibirErroCampo('campo-responsavel', 'erro-responsavel', 'Selecione o responsável.');
            valido = false;
        }

        if (!dataAberturaStr) {
            exibirErroCampo('campo-data-abertura', 'erro-data-abertura', 'A data de abertura é obrigatória.');
            valido = false;
        } else {
            const dataInf = new Date(dataAberturaStr);
            const agora = new Date();
            if (dataInf > agora) {
                exibirErroCampo('campo-data-abertura', 'erro-data-abertura', 'Não é permitida data futura.');
                valido = false;
            }
        }

        if (!valido) return;

        const ordens = carregarOrdens();
        const dataIsoAbertura = new Date(dataAberturaStr).toISOString();

        if (idEdicao) {
            // Edição
            const idx = ordens.findIndex(o => String(o.id) === String(idEdicao));
            if (idx === -1) return;

            const osAnterior = ordens[idx];
            const statusMudou = osAnterior.status !== status;

            ordens[idx].descricao = descricao;
            ordens[idx].tipo = tipo;
            ordens[idx].status = status;
            ordens[idx].azure = azure;
            ordens[idx].modulo = modulo;
            ordens[idx].versao = versao;
            ordens[idx].ambiente = ambiente;
            ordens[idx].responsavel = responsavel;
            ordens[idx].dataAbertura = dataIsoAbertura;

            // Se o histórico não existia, inicia com a data de abertura
            if (!Array.isArray(ordens[idx].historico) || ordens[idx].historico.length === 0) {
                ordens[idx].historico = [{ status: osAnterior.status, dataHora: dataIsoAbertura }];
            }

            if (statusMudou) {
                ordens[idx].historico.push({
                    status: status,
                    dataHora: new Date().toISOString()
                });
            }

            salvarOrdens(ordens);
            mostrarToast('Ordem de Serviço atualizada com sucesso!', 'sucesso');
        } else {
            // Nova OS
            const novaOS = {
                id: Date.now(),
                descricao: descricao,
                tipo: tipo,
                status: status,
                azure: azure,
                modulo: modulo,
                versao: versao,
                ambiente: ambiente,
                responsavel: responsavel,
                dataAbertura: dataIsoAbertura,
                historico: [
                    { status: status, dataHora: dataIsoAbertura }
                ]
            };
            ordens.push(novaOS);
            salvarOrdens(ordens);
            mostrarToast('Nova Ordem de Serviço cadastrada com sucesso!', 'sucesso');
        }

        fecharModal('modal-os');
        atualizarTudo();
    }

    // ========================================================
    // 9. MODAL DE DETALHES DA OS E HISTÓRICO
    // ========================================================

    function abrirModalDetalhes(id) {
        const os = obterOSPorId(id);
        if (!os) return;

        osSendoVisualizadaId = id;

        // Badge do status no topo
        const badgeContainer = document.getElementById('detalhes-badge-status');
        badgeContainer.innerHTML = `<span class="badge badge-status-${escaparHTML(os.status)}">${escaparHTML(os.status)}</span>`;

        // Campos detalhados
        const corpo = document.getElementById('detalhes-corpo');
        const classeTipo = obterClasseTipoBadge(os.tipo);

        const moduloTxt = os.modulo && os.modulo.trim() ? escaparHTML(os.modulo) : '<span class="texto-nao-informado">Não informado</span>';
        const versaoTxt = os.versao && os.versao.trim() ? escaparHTML(os.versao) : '<span class="texto-nao-informado">Não informado</span>';
        const ambienteTxt = os.ambiente && os.ambiente.trim() ? escaparHTML(os.ambiente) : '<span class="texto-nao-informado">Não informado</span>';
        const respTxt = os.responsavel && os.responsavel.trim() ? escaparHTML(os.responsavel) : '<span class="texto-nao-informado">Não informado</span>';
        const azureTxt = os.azure && os.azure.trim() ? '#' + escaparHTML(os.azure) : '—';

        corpo.innerHTML = `
            <div class="detalhes-item col-dupla">
                <span class="detalhes-label">Descrição</span>
                <span class="detalhes-valor">${escaparHTML(os.descricao)}</span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Nº Azure DevOps</span>
                <span class="detalhes-valor"><strong>${azureTxt}</strong></span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Tipo / Prioridade</span>
                <span class="detalhes-valor"><span class="badge ${classeTipo}">${escaparHTML(os.tipo)}</span></span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Módulo</span>
                <span class="detalhes-valor">${moduloTxt}</span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Versão</span>
                <span class="detalhes-valor">${versaoTxt}</span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Ambiente</span>
                <span class="detalhes-valor">${ambienteTxt}</span>
            </div>
            <div class="detalhes-item">
                <span class="detalhes-label">Responsável</span>
                <span class="detalhes-valor">${respTxt}</span>
            </div>
            <div class="detalhes-item col-dupla">
                <span class="detalhes-label">Data e Hora de Abertura</span>
                <span class="detalhes-valor">${formatarDataHora(os.dataAbertura)}</span>
            </div>
        `;

        // Renderiza tabela de histórico
        renderizarHistoricoDetalhes(os);

        abrirModal('modal-detalhes');
    }

    function renderizarHistoricoDetalhes(os) {
        const corpoTabela = document.getElementById('detalhes-historico-corpo');
        if (!corpoTabela) return;

        let historico = os.historico;
        if (!Array.isArray(historico) || historico.length === 0) {
            historico = [{ status: os.status, dataHora: os.dataAbertura || new Date().toISOString() }];
        }

        let html = '';
        const agora = Date.now();

        for (let i = 0; i < historico.length; i++) {
            const evento = historico[i];
            const dataInicio = new Date(evento.dataHora).getTime();
            const ehAtual = (i === historico.length - 1);

            let dataFim;
            if (ehAtual) {
                dataFim = agora;
            } else {
                dataFim = new Date(historico[i + 1].dataHora).getTime();
            }

            const duracaoMs = dataFim - dataInicio;
            const duracaoTxt = formatarDuracao(duracaoMs);
            const classeLinha = ehAtual ? 'class="etapa-atual"' : '';

            html += `
                <tr ${classeLinha}>
                    <td>
                        <span class="badge badge-status-${escaparHTML(evento.status)}">${escaparHTML(evento.status)}</span>
                        ${ehAtual ? ' <em>(Atual)</em>' : ''}
                    </td>
                    <td>${formatarDataHora(evento.dataHora)}</td>
                    <td>${duracaoTxt}</td>
                </tr>
            `;
        }

        corpoTabela.innerHTML = html;
    }

    // Excluir OS com confirmação
    function excluirOS(id) {
        abrirConfirmacao('Tem certeza que deseja excluir esta Ordem de Serviço? Esta ação não pode ser desfeita.', [
            { texto: 'Cancelar', classe: 'btn btn-cancelar', acao: () => fecharModal('modal-confirmacao') },
            {
                texto: 'Sim, Excluir', classe: 'btn btn-perigo', acao: () => {
                    fecharModal('modal-confirmacao');
                    fecharModal('modal-detalhes');
                    let ordens = carregarOrdens();
                    ordens = ordens.filter(o => String(o.id) !== String(id));
                    salvarOrdens(ordens);
                    mostrarToast('Ordem de Serviço excluída.', 'sucesso');
                    atualizarTudo();
                }
            }
        ]);
    }

    // ========================================================
    // 10. LINK PÚBLICO (sem login, Base64 com TextEncoder)
    // ========================================================

    function copiarLinkPublico(id) {
        const os = obterOSPorId(id);
        if (!os) return;

        // Monta histórico com tempos calculados
        const agora = Date.now();
        let histCalculado = [];
        const historico = Array.isArray(os.historico) && os.historico.length > 0 ?
            os.historico : [{ status: os.status, dataHora: os.dataAbertura || new Date().toISOString() }];

        for (let i = 0; i < historico.length; i++) {
            const evento = historico[i];
            const dataInicio = new Date(evento.dataHora).getTime();
            const ehAtual = (i === historico.length - 1);
            const dataFim = ehAtual ? agora : new Date(historico[i + 1].dataHora).getTime();
            const duracaoMs = dataFim - dataInicio;

            histCalculado.push({
                status: evento.status,
                dataHora: evento.dataHora,
                tempo: formatarDuracao(duracaoMs),
                atual: ehAtual
            });
        }

        // Apenas os dados necessários
        const dadosPublicos = {
            azure: os.azure || '',
            descricao: os.descricao || '',
            tipo: os.tipo || '',
            status: os.status || '',
            modulo: os.modulo || '',
            versao: os.versao || '',
            ambiente: os.ambiente || '',
            responsavel: os.responsavel || '',
            dataAbertura: os.dataAbertura || '',
            historico: histCalculado
        };

        try {
            const jsonStr = JSON.stringify(dadosPublicos);
            const bytes = new TextEncoder().encode(jsonStr);
            let binario = '';
            for (let b = 0; b < bytes.length; b++) {
                binario += String.fromCharCode(bytes[b]);
            }
            const base64 = btoa(binario);

            const urlAtual = window.location.href;
            const baseUrl = urlAtual.substring(0, urlAtual.lastIndexOf('/') + 1);
            const linkCompleto = `${baseUrl}publico.html?dados=${encodeURIComponent(base64)}`;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(linkCompleto).then(() => {
                    mostrarToast('Link público copiado para a área de transferência!', 'sucesso');
                }).catch(() => {
                    copiarViaTextarea(linkCompleto);
                });
            } else {
                copiarViaTextarea(linkCompleto);
            }
        } catch (e) {
            console.error('Erro ao gerar link público:', e);
            mostrarToast('Erro ao gerar link público.', 'erro');
        }
    }

    function copiarViaTextarea(texto) {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            mostrarToast('Link público copiado!', 'sucesso');
        } catch (e) {
            prompt('Copie o link abaixo:', texto);
        }
        document.body.removeChild(ta);
    }

    // ========================================================
    // 11. CONFIGURAÇÕES (RESPONSÁVEIS)
    // ========================================================

    function renderizarConfiguracoes() {
        const lista = carregarResponsaveis();
        const container = document.getElementById('lista-responsaveis-container');
        if (!container) return;

        if (lista.length === 0) {
            container.innerHTML = '<p class="mensagem-vazia">Nenhum responsável cadastrado.</p>';
            return;
        }

        let html = '';
        lista.forEach((nome, idx) => {
            html += `
                <div class="item-responsavel">
                    <span class="item-responsavel-nome">${escaparHTML(nome)}</span>
                    <div class="item-responsavel-acoes">
                        <button type="button" class="btn btn-secundario btn-pequeno btn-editar-resp" data-idx="${idx}">Editar</button>
                        <button type="button" class="btn btn-perigo btn-pequeno btn-remover-resp" data-idx="${idx}">Remover</button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // Eventos de edição
        container.querySelectorAll('.btn-editar-resp').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                iniciarEdicaoResponsavel(idx, lista[idx]);
            });
        });

        // Eventos de remoção
        container.querySelectorAll('.btn-remover-resp').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                removerResponsavel(idx, lista[idx]);
            });
        });
    }

    function iniciarEdicaoResponsavel(idx, nomeAtual) {
        document.getElementById('responsavel-indice-edicao').value = idx;
        document.getElementById('campo-nome-responsavel').value = nomeAtual;
        document.getElementById('btn-salvar-responsavel').textContent = 'Salvar Alteração';
        document.getElementById('btn-cancelar-edicao-resp').classList.remove('oculto');
        document.getElementById('campo-nome-responsavel').focus();
    }

    function cancelarEdicaoResponsavel() {
        document.getElementById('responsavel-indice-edicao').value = '';
        document.getElementById('campo-nome-responsavel').value = '';
        document.getElementById('erro-nome-responsavel').textContent = '';
        document.getElementById('btn-salvar-responsavel').textContent = 'Adicionar';
        document.getElementById('btn-cancelar-edicao-resp').classList.add('oculto');
    }

    function salvarResponsavel(e) {
        e.preventDefault();
        const inputNome = document.getElementById('campo-nome-responsavel');
        const erroNome = document.getElementById('erro-nome-responsavel');
        const idxEdicao = document.getElementById('responsavel-indice-edicao').value;

        erroNome.textContent = '';
        const nome = inputNome.value.trim();

        if (!nome) {
            erroNome.textContent = 'O nome do responsável não pode ficar vazio.';
            inputNome.focus();
            return;
        }

        const lista = carregarResponsaveis();
        const nomeExiste = lista.some((r, i) => r.toLowerCase() === nome.toLowerCase() && String(i) !== String(idxEdicao));

        if (nomeExiste) {
            erroNome.textContent = 'Já existe um responsável cadastrado com esse nome.';
            inputNome.focus();
            return;
        }

        if (idxEdicao !== '') {
            lista[parseInt(idxEdicao)] = nome;
            mostrarToast('Responsável atualizado com sucesso!', 'sucesso');
        } else {
            lista.push(nome);
            mostrarToast('Responsável adicionado com sucesso!', 'sucesso');
        }

        salvarResponsaveis(lista);
        cancelarEdicaoResponsavel();
        renderizarConfiguracoes();
        atualizarOpcoesFiltrosTabela(carregarOrdens());
    }

    function removerResponsavel(idx, nome) {
        abrirConfirmacao(`Deseja realmente remover o responsável "${nome}"? As OS antigas manterão o nome gravado.`, [
            { texto: 'Cancelar', classe: 'btn btn-cancelar', acao: () => fecharModal('modal-confirmacao') },
            {
                texto: 'Sim, Remover', classe: 'btn btn-perigo', acao: () => {
                    fecharModal('modal-confirmacao');
                    const lista = carregarResponsaveis();
                    lista.splice(idx, 1);
                    salvarResponsaveis(lista);
                    cancelarEdicaoResponsavel();
                    mostrarToast(`Responsável "${nome}" removido.`, 'sucesso');
                    renderizarConfiguracoes();
                    atualizarOpcoesFiltrosTabela(carregarOrdens());
                }
            }
        ]);
    }

    // ========================================================
    // 12. EXPORTAÇÃO (PDF e EXCEL)
    // ========================================================

    // Formata filtros ativos em texto legível para o relatório
    function obterTextoFiltrosAtivosTabela() {
        const partes = [];
        const fStatus = document.getElementById('filtro-tab-status').value;
        const fTipo = document.getElementById('filtro-tab-tipo').value;
        const fVersao = document.getElementById('filtro-tab-versao').value;
        const fAmbiente = document.getElementById('filtro-tab-ambiente').value;
        const fModulo = document.getElementById('filtro-tab-modulo').value;
        const fResp = document.getElementById('filtro-tab-responsavel').value;
        const fBusca = document.getElementById('filtro-tab-busca').value.trim();

        if (fStatus) partes.push(`Status: ${fStatus}`);
        if (fTipo) partes.push(`Tipo: ${fTipo}`);
        if (fVersao) partes.push(`Versão: ${fVersao === '__SEM_VALOR__' ? 'Não informado' : fVersao}`);
        if (fAmbiente) partes.push(`Ambiente: ${fAmbiente === '__SEM_VALOR__' ? 'Não informado' : fAmbiente}`);
        if (fModulo) partes.push(`Módulo: ${fModulo === '__SEM_VALOR__' ? 'Não informado' : fModulo}`);
        if (fResp) partes.push(`Responsável: ${fResp === '__SEM_VALOR__' ? 'Não informado' : fResp}`);
        if (fBusca) partes.push(`Busca: "${fBusca}"`);

        return partes.length > 0 ? partes.join(' | ') : 'Sem filtros aplicados (Todas as OS)';
    }

    // Gera PDF com jsPDF + autotable
    function gerarPDF() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            mostrarToast('Biblioteca jsPDF não carregada. Verifique a conexão com a internet.', 'erro');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');

        const ordensFiltradas = obterOrdensFiltradasTabela();
        const agora = new Date();
        const dataFormatada = formatarDataHora(agora.toISOString());
        const textoFiltros = obterTextoFiltrosAtivosTabela();

        // Cabeçalho
        doc.setFontSize(16);
        doc.setTextColor(26, 115, 232);
        doc.text('Controle de Ordem de Serviço - SISS', 14, 15);

        doc.setFontSize(10);
        doc.setTextColor(95, 99, 104);
        doc.text(`Data e hora da geração: ${dataFormatada}`, 14, 22);
        doc.text(`Filtros: ${textoFiltros}`, 14, 27);

        // Tabela de OS
        const cabecalho = [['Nº Azure', 'Descrição', 'Tipo', 'Status', 'Módulo', 'Versão', 'Ambiente', 'Responsável', 'Data Abertura']];
        const linhas = ordensFiltradas.map(os => [
            os.azure || '—',
            os.descricao || '',
            os.tipo || '',
            os.status || '',
            os.modulo || 'Não informado',
            os.versao || 'Não informado',
            os.ambiente || 'Não informado',
            os.responsavel || 'Não informado',
            formatarDataHora(os.dataAbertura)
        ]);

        doc.autoTable({
            head: cabecalho,
            body: linhas,
            startY: 32,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [26, 115, 232], textColor: 255 },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 50 },
                2: { cellWidth: 26 },
                3: { cellWidth: 22 },
                4: { cellWidth: 28 },
                5: { cellWidth: 32 },
                6: { cellWidth: 22 },
                7: { cellWidth: 30 },
                8: { cellWidth: 34 }
            }
        });

        // Totais por status no final
        const posFinalY = doc.lastAutoTable.finalY + 8;
        const contagens = {};
        STATUS_LISTA.forEach(s => contagens[s] = 0);
        ordensFiltradas.forEach(os => {
            if (contagens[os.status] !== undefined) contagens[os.status]++;
        });

        let textoTotais = 'Totais por status: ' + STATUS_LISTA.map(s => `${s}: ${contagens[s]}`).join(' | ');
        textoTotais += ` | Total Geral: ${ordensFiltradas.length}`;

        doc.setFontSize(9);
        doc.setTextColor(32, 33, 36);
        doc.text(textoTotais, 14, posFinalY > 195 ? 195 : posFinalY);

        const dataIsoNome = agora.toISOString().split('T')[0];
        doc.save(`relatorio-os-${dataIsoNome}.pdf`);
        mostrarToast('Relatório PDF gerado com sucesso!', 'sucesso');
    }

    // Exporta Excel (.xlsx) com SheetJS (2 abas)
    function exportarExcel() {
        if (!window.XLSX) {
            mostrarToast('Biblioteca SheetJS não carregada. Verifique a conexão com a internet.', 'erro');
            return;
        }

        const ordensFiltradas = obterOrdensFiltradasTabela();
        const agora = new Date();

        // Aba 1: Ordens de Serviço
        const dadosAbaOS = ordensFiltradas.map(os => {
            // Histórico resumido
            let histTxt = '';
            if (Array.isArray(os.historico) && os.historico.length > 0) {
                histTxt = os.historico.map(h => `${h.status} em ${formatarDataHora(h.dataHora)}`).join(' -> ');
            }

            return {
                'Nº Azure DevOps': os.azure || '—',
                'Descrição': os.descricao || '',
                'Tipo': os.tipo || '',
                'Status': os.status || '',
                'Módulo': os.modulo || 'Não informado',
                'Versão': os.versao || 'Não informado',
                'Ambiente': os.ambiente || 'Não informado',
                'Responsável': os.responsavel || 'Não informado',
                'Data de Abertura': formatarDataHora(os.dataAbertura),
                'Histórico Resumido': histTxt
            };
        });

        // Aba 2: Resumo (totais por status, por tipo, por versão e por ambiente)
        const resumoDados = [];

        // Por Status
        resumoDados.push({ 'Categoria': 'STATUS', 'Item': '', 'Quantidade': '' });
        STATUS_LISTA.forEach(s => {
            const qtd = ordensFiltradas.filter(os => os.status === s).length;
            resumoDados.push({ 'Categoria': '', 'Item': s, 'Quantidade': qtd });
        });

        // Por Tipo
        resumoDados.push({ 'Categoria': '', 'Item': '', 'Quantidade': '' });
        resumoDados.push({ 'Categoria': 'TIPO', 'Item': '', 'Quantidade': '' });
        TIPOS_LISTA.forEach(t => {
            const qtd = ordensFiltradas.filter(os => os.tipo === t).length;
            resumoDados.push({ 'Categoria': '', 'Item': t, 'Quantidade': qtd });
        });

        // Por Versão
        resumoDados.push({ 'Categoria': '', 'Item': '', 'Quantidade': '' });
        resumoDados.push({ 'Categoria': 'VERSÃO', 'Item': '', 'Quantidade': '' });
        VERSOES_LISTA.forEach(v => {
            const qtd = ordensFiltradas.filter(os => os.versao === v).length;
            resumoDados.push({ 'Categoria': '', 'Item': v, 'Quantidade': qtd });
        });
        const versaoSem = ordensFiltradas.filter(os => !os.versao).length;
        if (versaoSem > 0) {
            resumoDados.push({ 'Categoria': '', 'Item': 'Não informado', 'Quantidade': versaoSem });
        }

        // Por Ambiente
        resumoDados.push({ 'Categoria': '', 'Item': '', 'Quantidade': '' });
        resumoDados.push({ 'Categoria': 'AMBIENTE', 'Item': '', 'Quantidade': '' });
        AMBIENTES_LISTA.forEach(a => {
            const qtd = ordensFiltradas.filter(os => os.ambiente === a).length;
            resumoDados.push({ 'Categoria': '', 'Item': a, 'Quantidade': qtd });
        });
        const ambSem = ordensFiltradas.filter(os => !os.ambiente).length;
        if (ambSem > 0) {
            resumoDados.push({ 'Categoria': '', 'Item': 'Não informado', 'Quantidade': ambSem });
        }

        // Total Geral
        resumoDados.push({ 'Categoria': '', 'Item': '', 'Quantidade': '' });
        resumoDados.push({ 'Categoria': 'TOTAL GERAL', 'Item': 'Total de OS', 'Quantidade': ordensFiltradas.length });

        const wb = XLSX.utils.book_new();
        const wsOS = XLSX.utils.json_to_sheet(dadosAbaOS);
        const wsResumo = XLSX.utils.json_to_sheet(resumoDados);

        XLSX.utils.book_append_sheet(wb, wsOS, 'Ordens de Serviço');
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

        const dataIsoNome = agora.toISOString().split('T')[0];
        XLSX.writeFile(wb, `relatorio-os-${dataIsoNome}.xlsx`);
        mostrarToast('Planilha Excel exportada com sucesso!', 'sucesso');
    }

    // ========================================================
    // 13. BACKUP (Exportar e Importar com Substituir/Mesclar)
    // ========================================================

    function exportarBackup() {
        const ordens = carregarOrdens();
        const responsaveis = carregarResponsaveis();

        const backup = {
            versao: '2.0',
            dataExportacao: new Date().toISOString(),
            ordens: ordens,
            responsaveis: responsaveis
        };

        const jsonStr = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const dataIsoNome = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `backup-siss-${dataIsoNome}.json`;
        a.click();
        URL.revokeObjectURL(url);

        mostrarToast('Backup exportado com sucesso!', 'sucesso');
    }

    function processarArquivoImportacao(arquivo) {
        if (!arquivo) return;
        const leitor = new FileReader();

        leitor.onload = (e) => {
            try {
                const dados = JSON.parse(e.target.result);
                let ordensImportadas = [];
                let responsaveisImportados = [];

                // Suporta formato novo { ordens, responsaveis } ou legado [ ...ordens ]
                if (Array.isArray(dados)) {
                    ordensImportadas = dados;
                } else if (dados && Array.isArray(dados.ordens)) {
                    ordensImportadas = dados.ordens;
                    if (Array.isArray(dados.responsaveis)) {
                        responsaveisImportados = dados.responsaveis;
                    }
                } else {
                    mostrarToast('Formato de backup inválido.', 'erro');
                    return;
                }

                // Normaliza dados antigos (campos novos em branco caso ausentes)
                ordensImportadas.forEach(os => {
                    if (!os.modulo) os.modulo = '';
                    if (!os.versao) os.versao = '';
                    if (!os.ambiente) os.ambiente = '';
                    if (!os.responsavel) os.responsavel = '';
                    if (!Array.isArray(os.historico)) {
                        os.historico = [{ status: os.status || 'Aberta', dataHora: os.dataAbertura || new Date().toISOString() }];
                    }
                });

                abrirConfirmacao(
                    `O backup contém ${ordensImportadas.length} ordens de serviço e ${responsaveisImportados.length} responsáveis. Deseja substituir os dados atuais ou mesclar com eles?`,
                    [
                        { texto: 'Cancelar', classe: 'btn btn-cancelar', acao: () => fecharModal('modal-confirmacao') },
                        {
                            texto: 'Substituir Tudo', classe: 'btn btn-perigo', acao: () => {
                                fecharModal('modal-confirmacao');
                                salvarOrdens(ordensImportadas);
                                if (responsaveisImportados.length > 0) {
                                    salvarResponsaveis(responsaveisImportados);
                                }
                                mostrarToast('Dados substituídos com sucesso pelo backup!', 'sucesso');
                                atualizarTudo();
                            }
                        },
                        {
                            texto: 'Mesclar Dados', classe: 'btn btn-destaque', acao: () => {
                                fecharModal('modal-confirmacao');
                                const ordensAtuais = carregarOrdens();
                                const idsExistentes = new Set(ordensAtuais.map(o => String(o.id)));
                                let adicionadas = 0;

                                ordensImportadas.forEach(os => {
                                    if (!idsExistentes.has(String(os.id))) {
                                        ordensAtuais.push(os);
                                        adicionadas++;
                                    }
                                });

                                // Mescla responsáveis sem duplicar
                                const respAtuais = carregarResponsaveis();
                                const nomesSet = new Set(respAtuais.map(r => r.toLowerCase()));
                                responsaveisImportados.forEach(r => {
                                    if (r && !nomesSet.has(r.toLowerCase())) {
                                        respAtuais.push(r);
                                        nomesSet.add(r.toLowerCase());
                                    }
                                });

                                salvarOrdens(ordensAtuais);
                                salvarResponsaveis(respAtuais);
                                mostrarToast(`Backup mesclado! ${adicionadas} novas OS adicionadas.`, 'sucesso');
                                atualizarTudo();
                            }
                        }
                    ]
                );
            } catch (err) {
                console.error('Erro ao ler backup:', err);
                mostrarToast('Erro ao ler o arquivo JSON de backup.', 'erro');
            }
        };

        leitor.readAsText(arquivo, 'UTF-8');
    }

    // ========================================================
    // 14. MODAIS E CONFIRMAÇÕES
    // ========================================================

    function abrirModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('oculto');
        document.body.style.overflow = 'hidden';

        setTimeout(() => {
            const primeiroFocavel = modal.querySelector('button, input, select, textarea');
            if (primeiroFocavel) primeiroFocavel.focus();
        }, 80);
    }

    function fecharModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('oculto');
        document.body.style.overflow = '';
    }

    function abrirConfirmacao(mensagem, botoes) {
        document.getElementById('confirma-mensagem').textContent = mensagem;
        const container = document.getElementById('confirma-botoes-container');
        container.innerHTML = '';

        botoes.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = b.classe;
            btn.textContent = b.texto;
            btn.addEventListener('click', b.acao);
            container.appendChild(btn);
        });

        abrirModal('modal-confirmacao');
    }

    // ========================================================
    // 15. ATUALIZAÇÃO GERAL E EVENTOS
    // ========================================================

    function atualizarTudo() {
        const abaAtiva = document.querySelector('.aba-btn.ativa')?.getAttribute('data-aba') || 'principal';
        if (abaAtiva === 'principal') {
            renderizarPrincipal();
        } else if (abaAtiva === 'kanban') {
            renderizarKanban();
        } else if (abaAtiva === 'configuracoes') {
            renderizarConfiguracoes();
        }
    }

    function inicializarEventos() {
        // Navegação
        inicializarNavegacao();

        // Botões de fechar modais (data-fechar)
        document.querySelectorAll('[data-fechar]').forEach(el => {
            el.addEventListener('click', () => {
                fecharModal(el.getAttribute('data-fechar'));
            });
        });

        // Fechar modais com tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['modal-confirmacao', 'modal-mover', 'modal-detalhes', 'modal-os'].forEach(id => {
                    const m = document.getElementById(id);
                    if (m && !m.classList.contains('oculto')) {
                        fecharModal(id);
                    }
                });
            }
        });

        // Botões "+ Nova OS"
        document.getElementById('btn-nova-os-topo')?.addEventListener('click', abrirModalNovaOS);
        document.getElementById('btn-nova-os-meio')?.addEventListener('click', abrirModalNovaOS);
        document.getElementById('btn-nova-os-kanban')?.addEventListener('click', abrirModalNovaOS);

        // Link dentro do alerta no modal para ir em Configurações
        document.getElementById('link-ir-configuracoes')?.addEventListener('click', (e) => {
            e.preventDefault();
            fecharModal('modal-os');
            ativarAba('configuracoes');
        });

        // Formulário de OS
        document.getElementById('form-os')?.addEventListener('submit', salvarFormularioOS);
        document.getElementById('campo-data-abertura')?.addEventListener('change', verificarDataRetroativa);
        document.getElementById('campo-data-abertura')?.addEventListener('input', verificarDataRetroativa);

        // Ações do modal de detalhes
        document.getElementById('btn-detalhes-editar')?.addEventListener('click', () => {
            if (osSendoVisualizadaId) {
                const id = osSendoVisualizadaId;
                fecharModal('modal-detalhes');
                abrirModalEditarOS(id);
            }
        });

        document.getElementById('btn-detalhes-excluir')?.addEventListener('click', () => {
            if (osSendoVisualizadaId) {
                excluirOS(osSendoVisualizadaId);
            }
        });

        document.getElementById('btn-detalhes-link-publico')?.addEventListener('click', () => {
            if (osSendoVisualizadaId) {
                copiarLinkPublico(osSendoVisualizadaId);
            }
        });

        // Exportações
        document.getElementById('btn-gerar-pdf')?.addEventListener('click', gerarPDF);
        document.getElementById('btn-exportar-excel')?.addEventListener('click', exportarExcel);

        // Backup
        document.getElementById('btn-exportar-backup')?.addEventListener('click', exportarBackup);
        const inputBackup = document.getElementById('input-importar-backup');
        inputBackup?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                processarArquivoImportacao(e.target.files[0]);
                e.target.value = '';
            }
        });

        // Filtros da Tabela
        ['filtro-tab-status', 'filtro-tab-tipo', 'filtro-tab-versao', 'filtro-tab-ambiente', 'filtro-tab-modulo', 'filtro-tab-responsavel'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', renderizarTabela);
        });
        document.getElementById('filtro-tab-busca')?.addEventListener('input', renderizarTabela);

        document.getElementById('btn-limpar-filtros-tab')?.addEventListener('click', () => {
            ['filtro-tab-status', 'filtro-tab-tipo', 'filtro-tab-versao', 'filtro-tab-ambiente', 'filtro-tab-modulo', 'filtro-tab-responsavel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const busca = document.getElementById('filtro-tab-busca');
            if (busca) busca.value = '';
            renderizarTabela();
        });

        // Filtros do Kanban
        ['filtro-kan-tipo', 'filtro-kan-versao', 'filtro-kan-ambiente', 'filtro-kan-modulo', 'filtro-kan-responsavel'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', renderizarKanban);
        });
        document.getElementById('filtro-kan-busca')?.addEventListener('input', renderizarKanban);

        document.getElementById('btn-limpar-filtros-kan')?.addEventListener('click', () => {
            ['filtro-kan-tipo', 'filtro-kan-versao', 'filtro-kan-ambiente', 'filtro-kan-modulo', 'filtro-kan-responsavel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const busca = document.getElementById('filtro-kan-busca');
            if (busca) busca.value = '';
            renderizarKanban();
        });

        // Configurações de Responsáveis
        document.getElementById('form-responsavel')?.addEventListener('submit', salvarResponsavel);
        document.getElementById('btn-cancelar-edicao-resp')?.addEventListener('click', cancelarEdicaoResponsavel);

        // Redimensionamento de tela para redesenhar gráficos
        window.addEventListener('resize', () => {
            if (document.getElementById('secao-principal') && !document.getElementById('secao-principal').classList.contains('oculto')) {
                renderizarGraficos(carregarOrdens());
            }
        });
    }

    // Inicialização ao carregar a página
    document.addEventListener('DOMContentLoaded', () => {
        carregarResponsaveis(); // Garante inicialização
        inicializarEventos();
        renderizarPrincipal();
    });

})();
