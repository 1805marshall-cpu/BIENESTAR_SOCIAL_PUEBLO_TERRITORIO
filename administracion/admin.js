// administracion/admin.js
import { db, collection, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from '../js/firebase-config.js';

let solicitudes = [];
let paginaActual = 1;
const filasPorPagina = 10; // 👈 Estrictamente 10 filas por página
let primerCargaCompletada = false;
let sesionActual = null;

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

    escucharSolicitudes();
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

    // Paginación estricta de 10 en 10
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
