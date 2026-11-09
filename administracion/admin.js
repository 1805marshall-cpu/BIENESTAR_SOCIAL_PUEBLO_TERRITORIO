// administracion/admin.js
import { db, collection, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from '../js/firebase-config.js';

let solicitudes = [];
let listaCitasGlobal = [];
let paginaActual = 1;
const filasPorPagina = 10;
let primerCargaCompletada = false;
let sesionActual = null;
let intervalAlertasCitas = null;

document.addEventListener('DOMContentLoaded', () => {
    sesionActual = JSON.parse(localStorage.getItem('usuarioActivo'));
    
    if (!sesionActual || !['super', 'admin', 'dir_bienestar', 'dir_territorio'].includes(sesionActual.rol)) {
        window.location.href = '../index.html';
        return;
    }

    configurarCabeceraYFiltros();

    // Event listeners para filtros de búsqueda y paginadores
    document.getElementById('filterBuscar')?.addEventListener('input', () => { paginaActual = 1; renderizarTabla(); });
    document.getElementById('filterGestion')?.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });
    document.getElementById('filterEstatus')?.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });
    document.getElementById('filterFechaDesde')?.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });
    document.getElementById('filterFechaHasta')?.addEventListener('change', () => { paginaActual = 1; renderizarTabla(); });

    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => {
        document.getElementById('filterBuscar').value = '';
        if (sesionActual.rol === 'super' || sesionActual.rol === 'admin') {
            document.getElementById('filterGestion').value = '';
        }
        document.getElementById('filterEstatus').value = '';
        document.getElementById('filterFechaDesde').value = '';
        document.getElementById('filterFechaHasta').value = '';
        paginaActual = 1;
        renderizarTabla();
        if (window.mostrarNotificacion) window.mostrarNotificacion("Filtros restablecidos", "info");
    });

    const inputFiltroCalendario = document.getElementById('filtroFechaCalendario');
    if (inputFiltroCalendario) {
        inputFiltroCalendario.addEventListener('change', (e) => {
            filtrarCitasPorFecha(e.target.value);
        });
    }

    // Escuchar datos en tiempo real de Firestore
    escucharSolicitudes();
    escucharCitasAdmin();

    // Iniciar verificador de alertas de reuniones
    iniciarVerificadorCercaniaCitas();
});

function configurarCabeceraYFiltros() {
    const badge = document.getElementById('badgeRolUsuario');
    const title = document.getElementById('headerTitle');
    const subtitle = document.getElementById('headerSubtitle');
    const selectGestion = document.getElementById('filterGestion');

    if (sesionActual.rol === 'super') {
        badge.innerHTML = `<i class="fa-solid fa-user-shield mr-1.5 text-amber-400"></i> Super Usuario: Ángel Vidal`;
        title.textContent = `Panel Global - Control Total`;
        subtitle.textContent = `Visualización combinada y libre entre departamentos`;
    } else if (sesionActual.rol === 'admin') {
        badge.innerHTML = `<i class="fa-solid fa-user-tie mr-1.5 text-teal-400"></i> Dirección General`;
        title.textContent = `Panel Ejecutivo - Dirección General`;
        subtitle.textContent = `Gestión general de solicitudes`;
    } else if (sesionActual.rol === 'dir_bienestar') {
        badge.innerHTML = `<i class="fa-solid fa-city mr-1.5 text-emerald-400"></i> Dirección de Bienestar Social`;
        title.textContent = `Panel Directivo - Bienestar Social`;
        subtitle.textContent = `Registros exclusivos de colonias y Bienestar`;
        
        if (selectGestion) {
            selectGestion.value = "BIENESTAR SOCIAL 2026";
            selectGestion.disabled = true;
            selectGestion.className += " bg-slate-100 cursor-not-allowed";
        }
    } else if (sesionActual.rol === 'dir_territorio') {
        badge.innerHTML = `<i class="fa-solid fa-map-location-dot mr-1.5 text-teal-400"></i> Dirección Pueblo y Territorio`;
        title.textContent = `Panel Directivo - Pueblo y Territorio`;
        subtitle.textContent = `Registros exclusivos de localidades y territorio`;
        
        if (selectGestion) {
            selectGestion.value = "PUEBLO Y TERRITORIO 2026";
            selectGestion.disabled = true;
            selectGestion.className += " bg-slate-100 cursor-not-allowed";
        }
    }
}

function obtenerGestionFiltroActiva() {
    if (sesionActual.rol === 'dir_bienestar') return 'BIENESTAR SOCIAL 2026';
    if (sesionActual.rol === 'dir_territorio') return 'PUEBLO Y TERRITORIO 2026';
    return document.getElementById('filterGestion')?.value || '';
}

function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        if (primerCargaCompletada) {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                if (change.type === "added") {
                    const gestionFiltro = obtenerGestionFiltroActiva();
                    if (!gestionFiltro || data.tipoGestion === gestionFiltro) {
                        if (window.mostrarNotificacion) window.mostrarNotificacion(`📥 Nueva solicitud recibida: Folio ${data.folio || 'S/F'}`, "info");
                    }
                }
            });
        }

        solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarKPIs();
        renderizarTabla();
        primerCargaCompletada = true;
    });
}

function escucharCitasAdmin() {
    const q = query(collection(db, "citas"), orderBy("fechaCita", "asc"));
    onSnapshot(q, (snapshot) => {
        listaCitasGlobal = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const badge = document.getElementById('badgeTotalCitas');
        if (badge) badge.textContent = listaCitasGlobal.length;
        
        poblarResumenFechas();
        verificarCercaniaCitasLogica();
    });
}

// --- SISTEMA DE ALERTAS AUTOMÁTICAS USANDO MOSTRARNOTIFICACION ---
function iniciarVerificadorCercaniaCitas() {
    if (intervalAlertasCitas) clearInterval(intervalAlertasCitas);

    // Revisar de inmediato al abrir la sesión o página
    verificarCercaniaCitasLogica();

    // Programar la revisión cada 60 segundos
    intervalAlertasCitas = setInterval(verificarCercaniaCitasLogica, 60000);
}

function verificarCercaniaCitasLogica() {
    const ahora = new Date();
    const contenedorBarra = document.getElementById('barraAlertaReunion');
    if (!contenedorBarra) return;

    let citaUrgenteActiva = null;
    let tipoAlerta = '';

    listaCitasGlobal.forEach(c => {
        if (!c.fechaCita || !c.horaCita) return;
        // Si ya fue atendida o cancelada, la ignoramos por completo
        if (c.estatus === 'CANCELADA' || c.estatus === 'ATENDIDA') return;

        const [anio, mes, dia] = c.fechaCita.split('-');
        const [hora, min] = c.horaCita.split(':');
        const fechaHoraCita = new Date(anio, mes - 1, dia, hora, min);

        const diferenciaMinutos = (fechaHoraCita - ahora) / (1000 * 60);

        if (diferenciaMinutos > -60 && diferenciaMinutos <= 30) {
            citaUrgenteActiva = { ...c, minutosRestantes: Math.round(diferenciaMinutos) };
            tipoAlerta = 'urgente';
        } else if (diferenciaMinutos > 30 && diferenciaMinutos <= 60 && !citaUrgenteActiva) {
            citaUrgenteActiva = { ...c, minutosRestantes: Math.round(diferenciaMinutos) };
            tipoAlerta = 'preventiva';
        }
    });

    if (citaUrgenteActiva) {
        if (tipoAlerta === 'urgente') {
            const tiempoTexto = citaUrgenteActiva.minutosRestantes <= 0 ? 
                '¡La reunión es en este momento!' : 
                `inicia en <b>${citaUrgenteActiva.minutosRestantes} minutos</b>`;

            contenedorBarra.className = "max-w-7xl mx-auto px-4 w-full mt-4 block";
            contenedorBarra.innerHTML = `
                <div class="bg-rose-700 text-white p-4 rounded-2xl shadow-xl border-2 border-rose-900 flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0">
                    <div class="flex items-center space-x-3">
                        <i class="fa-solid fa-triangle-exclamation text-2xl animate-pulse"></i>
                        <div>
                            <h4 class="text-xs font-black uppercase tracking-wider">¡Reunión Inminente!</h4>
                            <p class="text-xs mt-0.5">Cita con <b>${citaUrgenteActiva.nombreSolicitante}</b> (${citaUrgenteActiva.horaCita} hrs) - ${tiempoTexto}.</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="marcarCitaAtendida('${citaUrgenteActiva.id}', '${citaUrgenteActiva.nombreSolicitante}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center">
                            <i class="fa-solid fa-check mr-1.5"></i> Confirmar Asistencia
                        </button>
                        <button onclick="abrirModalCalendario()" class="px-3 py-2 bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs rounded-xl shadow transition-colors">
                            Ver Agenda
                        </button>
                    </div>
                </div>
            `;
        } else {
            contenedorBarra.className = "max-w-7xl mx-auto px-4 w-full mt-4 block";
            contenedorBarra.innerHTML = `
                <div class="bg-amber-600 text-white p-4 rounded-2xl shadow-lg border border-amber-700 flex flex-col md:flex-row justify-between items-center space-y-3 md:space-y-0">
                    <div class="flex items-center space-x-3">
                        <i class="fa-solid fa-clock text-2xl"></i>
                        <div>
                            <h4 class="text-xs font-black uppercase tracking-wider">Aviso de Agenda Próxima</h4>
                            <p class="text-xs mt-0.5">Reunión con <b>${citaUrgenteActiva.nombreSolicitante}</b> a las <b>${citaUrgenteActiva.horaCita} hrs</b> (Falta aprox. 1 hora).</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="marcarCitaAtendida('${citaUrgenteActiva.id}', '${citaUrgenteActiva.nombreSolicitante}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center">
                            <i class="fa-solid fa-check mr-1.5"></i> Confirmar Asistencia
                        </button>
                        <button onclick="abrirModalCalendario()" class="px-3 py-2 bg-white text-amber-700 hover:bg-amber-50 font-bold text-xs rounded-xl shadow transition-colors">
                            Ver Agenda
                        </button>
                    </div>
                </div>
            `;
        }
    } else {
        contenedorBarra.className = "hidden max-w-7xl mx-auto px-4 w-full mt-4";
        contenedorBarra.innerHTML = "";
    }
}


function actualizarKPIs() {
    const gestionFiltro = obtenerGestionFiltroActiva();
    const listaFiltrada = solicitudes.filter(s => !gestionFiltro || s.tipoGestion === gestionFiltro);

    const total = listaFiltrada.length;
    const pendientes = listaFiltrada.filter(s => (s.status || 'PENDIENTE') === 'PENDIENTE').length;
    const proceso = listaFiltrada.filter(s => s.status === 'EN PROCESO').length;
    const realizados = listaFiltrada.filter(s => s.status === 'REALIZADO').length;
    const prioritarias = listaFiltrada.filter(s => (s.prioridad || '').toUpperCase() === 'PRIORITARIA').length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiPendientes').textContent = pendientes;
    document.getElementById('kpiProceso').textContent = proceso;
    document.getElementById('kpiRealizados').textContent = realizados;
    document.getElementById('kpiPrioritarias').textContent = prioritarias;
}

function renderizarTabla() {
    const tbody = document.getElementById('tablaAdminBody');
    if (!tbody) return;

    const busqueda = document.getElementById('filterBuscar')?.value.toLowerCase() || '';
    const gestion = obtenerGestionFiltroActiva();
    const estatus = document.getElementById('filterEstatus')?.value || '';
    const desde = document.getElementById('filterFechaDesde')?.value || '';
    const hasta = document.getElementById('filterFechaHasta')?.value || '';

    const filtrados = solicitudes.filter(s => {
        const cumpleGestion = !gestion || s.tipoGestion === gestion;
        
        const cumpleBusqueda = 
            (s.folio && s.folio.toLowerCase().includes(busqueda)) ||
            (s.nombre && s.nombre.toLowerCase().includes(busqueda)) ||
            (s.colonia && s.colonia.toLowerCase().includes(busqueda)) ||
            (s.localidad && s.localidad.toLowerCase().includes(busqueda)) ||
            (s.requerimiento && s.requerimiento.toLowerCase().includes(busqueda));

        const cumpleEstatus = !estatus || (s.status || 'PENDIENTE') === estatus;
        
        let cumpleFecha = true;
        if (desde && s.fecha) cumpleFecha = cumpleFecha && (s.fecha >= desde);
        if (hasta && s.fecha) cumpleFecha = cumpleFecha && (s.fecha <= hasta);

        return cumpleGestion && cumpleBusqueda && cumpleEstatus && cumpleFecha;
    });

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const paginados = filtrados.slice(inicio, fin);

    tbody.innerHTML = paginados.map(s => {
        const ubi = s.colonia || s.localidad || 'N/D';
        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-3 font-mono font-bold text-teal-800">${s.folio || 'S/F'}</td>
                <td class="py-3 px-3">${s.fecha || '--'}</td>
                <td class="py-3 px-3">
                    <span class="font-bold text-slate-800 block">${s.nombre || ''}</span>
                    <span class="text-[10px] text-slate-400">${ubi}</span>
                </td>
                <td class="py-3 px-3">
                    <span class="font-semibold text-slate-700 block">${s.requerimiento || ''}</span>
                    <span class="text-[10px] text-slate-500 line-clamp-1">${s.detalles || ''}</span>
                </td>
                <td class="py-3 px-3">
                    <span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold text-[10px]">${s.clasificacion || ''}</span>
                    <span class="block text-[10px] text-slate-400">${s.ruta || ''}</span>
                </td>
                <td class="py-3 px-3 text-slate-500 text-[11px] italic">
                    ${s.observaciones || 'Sin observaciones'}
                </td>
                <td class="py-3 px-3">${obtenerBadgeEstatus(s.status)}</td>
                <td class="py-3 px-3 text-center space-x-1">
                    <button onclick="abrirModalDictamen('${s.id}')" title="Dictaminar" class="p-1.5 bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white rounded transition-colors">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="eliminarSolicitud('${s.id}', '${s.folio || 'S/F'}')" title="Eliminar" class="p-1.5 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white rounded transition-colors">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderizarPaginador(filtrados.length);
}

function obtenerBadgeEstatus(status) {
    const estado = (status || 'PENDIENTE').toUpperCase();
    const colores = {
        'PENDIENTE': 'bg-amber-100 text-amber-800 border border-amber-300',
        'EN PROCESO': 'bg-blue-100 text-blue-800 border border-blue-300',
        'CANALIZADO': 'bg-purple-100 text-purple-800 border border-purple-300',
        'REALIZADO': 'bg-emerald-100 text-emerald-800 border border-emerald-300'
    };
    return `<span class="${colores[estado] || 'bg-slate-100 text-slate-800'} px-2.5 py-1 rounded-full font-bold text-[10px] shadow-sm">${estado}</span>`;
}

// --- FUNCIONES DEL CALENDARIO FLOTANTE Y AGENDA DE CITAS ---

function poblarResumenFechas() {
    const contenedor = document.getElementById('listaResumenFechas');
    if (!contenedor) return;

    if (listaCitasGlobal.length === 0) {
        contenedor.innerHTML = `<p class="text-[11px] text-slate-400 text-center py-4">No hay citas registradas.</p>`;
        return;
    }

    contenedor.innerHTML = listaCitasGlobal.map(c => {
        const colorEstado = calcularColorTiempo(c.fechaCita, c.horaCita, c.estatus);
        return `
            <div onclick="filtrarCitasPorFecha('${c.fechaCita}')" class="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-teal-50 cursor-pointer transition-colors flex items-center justify-between shadow-sm">
                <div class="flex items-center space-x-2">
                    <span class="w-2.5 h-2.5 rounded-full ${colorEstado}"></span>
                    <div>
                        <p class="text-xs font-bold text-slate-800">${c.fechaCita}</p>
                        <p class="text-[10px] text-slate-500 truncate max-w-[120px]">${c.nombreSolicitante}</p>
                    </div>
                </div>
                <span class="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">${c.horaCita || '--:--'}</span>
            </div>
        `;
    }).join('');
}

function calcularColorTiempo(fechaCita, horaCita, estatus) {
    if (estatus === 'CANCELADA' || estatus === 'ATENDIDA') return 'bg-slate-400';
    
    const ahora = new Date();
    const [anio, mes, dia] = fechaCita.split('-');
    const [hora, min] = (horaCita || '00:00').split(':');
    const fechaHoraCita = new Date(anio, mes - 1, dia, hora, min);

    const diferenciaHoras = (fechaHoraCita - ahora) / (1000 * 60 * 60);

    if (diferenciaHoras < 0) {
        return 'bg-rose-500 animate-pulse';
    } else if (diferenciaHoras <= 24) {
        return 'bg-amber-500';
    } else {
        return 'bg-emerald-500';
    }
}

window.filtrarCitasPorFecha = (fechaSeleccionada) => {
    const contenedor = document.getElementById('contenedorCitasDia');
    const titulo = document.getElementById('tituloDetalleFecha');
    const contador = document.getElementById('contadorCitasDia');
    
    const filtradas = listaCitasGlobal.filter(c => c.fechaCita === fechaSeleccionada);
    
    if (titulo) titulo.innerHTML = `<span>Citas para el: ${fechaSeleccionada}</span>`;
    if (contador) contador.textContent = `${filtradas.length} citas`;

    if (filtradas.length === 0) {
        contenedor.innerHTML = `<p class="text-xs text-slate-400 text-center py-10">No hay citas agendadas para esta fecha.</p>`;
        return;
    }

    contenedor.innerHTML = filtradas.map(c => `
        <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 shadow-sm">
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-[10px] font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">${c.folio}</span>
                    <h5 class="text-xs font-bold text-slate-800 mt-1">${c.nombreSolicitante}</h5>
                </div>
                <div class="text-right">
                    <span class="text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-sm">${c.horaCita || '--:--'} hrs</span>
                    <span class="block text-[10px] font-bold mt-1 text-slate-500 uppercase">${c.estatus || 'PROGRAMADA'}</span>
                </div>
            </div>
            <p class="text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                <strong class="text-slate-700">Asunto:</strong> ${c.asunto || 'Sin especificar'}
            </p>
            <p class="text-[10px] text-slate-400 italic">Agendado por: ${c.agendadoPor || 'Recepción'}</p>
        </div>
    `).join('');
};

window.cargarCitasHoy = () => {
    const hoy = new Date().toISOString().split('T')[0];
    const inputFecha = document.getElementById('filtroFechaCalendario');
    if (inputFecha) inputFecha.value = hoy;
    filtrarCitasPorFecha(hoy);
};

// --- FIN FUNCIONES DEL CALENDARIO ---

window.abrirModalDictamen = (id) => {
    const solicitud = solicitudes.find(s => s.id === id);
    if (!solicitud) return;

    document.getElementById('dictamenId').value = solicitud.id;
    document.getElementById('dictamenFolio').value = `${solicitud.folio || 'S/F'} - ${solicitud.nombre || ''}`;
    document.getElementById('dictamenEstatus').value = solicitud.status || 'PENDIENTE';
    document.getElementById('dictamenObservaciones').value = solicitud.observaciones || '';

    document.getElementById('modalDictamen').classList.remove('hidden');
};

window.cerrarModalDictamen = () => {
    document.getElementById('modalDictamen').classList.add('hidden');
};

window.guardarDictamen = async (e) => {
    e.preventDefault();
    const id = document.getElementById('dictamenId').value;
    const status = document.getElementById('dictamenEstatus').value;
    const observaciones = document.getElementById('dictamenObservaciones').value.trim();

    try {
        const docRef = doc(db, "solicitudes", id);
        await updateDoc(docRef, { status, observaciones });

        cerrarModalDictamen();
        if (window.mostrarNotificacion) window.mostrarNotificacion("✅ Dictamen actualizado con éxito", "success");
    } catch (error) {
        console.error("Error al dictaminar:", error);
        if (window.mostrarNotificacion) window.mostrarNotificacion("❌ Error al guardar el dictamen", "error");
    }
};

window.eliminarSolicitud = async (id, folio) => {
    if (confirm(`¿Está seguro de eliminar permanentemente el folio: ${folio}?`)) {
        try {
            await deleteDoc(doc(db, "solicitudes", id));
            if (window.mostrarNotificacion) window.mostrarNotificacion(`🗑️ Folio ${folio} eliminado`, "warning");
        } catch (error) {
            console.error("Error al eliminar:", error);
            if (window.mostrarNotificacion) window.mostrarNotificacion("❌ Error al intentar eliminar", "error");
        }
    }
};

function renderizarPaginador(totalItems) {
    const totalPaginas = Math.ceil(totalItems / filasPorPagina) || 1;
    const contenedor = document.getElementById('paginadorAdmin');
    if(!contenedor) return;

    contenedor.innerHTML = `
        <div>Mostrando <span class="font-bold text-slate-700">${totalItems > 0 ? (paginaActual - 1) * filasPorPagina + 1 : 0}</span> a <span class="font-bold text-slate-700">${Math.min(paginaActual * filasPorPagina, totalItems)}</span> de <span class="font-bold text-slate-700">${totalItems}</span> registros</div>
        <div class="flex items-center space-x-2">
            <button onclick="cambiarPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Anterior</button>
            <span class="px-3 py-1.5 bg-teal-700 text-white font-bold rounded">${paginaActual} / ${totalPaginas}</span>
            <button onclick="cambiarPagina(${paginaActual + 1})" ${paginaActual >= totalPaginas ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Siguiente</button>
        </div>
    `;
}

window.cambiarPagina = (nuevaPagina) => {
    paginaActual = nuevaPagina;
    renderizarTabla();
};

window.marcarCitaAtendida = async (idCita, nombre) => {
    if (confirm(`¿Confirma que el ciudadano ${nombre} asistió y la reunión ha sido atendida?`)) {
        try {
            const citaRef = doc(db, "citas", idCita);
            await updateDoc(citaRef, { estatus: "ATENDIDA" });
            
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion(`✅ Asistencia confirmada para ${nombre}. Reunión marcada como atendida.`, "success");
            }
            
            // Ocultar la barra de inmediato
            const barra = document.getElementById('barraAlertaReunion');
            if (barra) {
                barra.className = "hidden max-w-7xl mx-auto px-4 w-full mt-4";
                barra.innerHTML = "";
            }
        } catch (error) {
            console.error("Error al actualizar la cita:", error);
            if (window.mostrarNotificacion) {
                window.mostrarNotificacion("❌ Error al registrar la asistencia", "error");
            }
        }
    }
};
