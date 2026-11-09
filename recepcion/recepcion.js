// recepcion/recepcion.js
import { db, collection, addDoc, doc, updateDoc, deleteDoc, query, orderBy, onSnapshot, serverTimestamp } from '../js/firebase-config.js';

let solicitudes = [];
let paginaActual = 1;
const filasPorPagina = 10;
let sesionActual = null;
let ultimosFiltrados = []; // Almacena temporalmente el resultado actual del filtro para la impresión

document.addEventListener('DOMContentLoaded', () => {
    // Validar sesión activa
    sesionActual = JSON.parse(localStorage.getItem('usuarioActivo'));
    if (!sesionActual) {
        window.location.href = '../index.html';
        return;
    }

    const form = document.getElementById('formCaptura');
    const selectTipo = document.getElementById('tipoGestion');
    const inputBuscar = document.getElementById('buscarRecepcion');
    const inputColonia = document.getElementById('colonia');
    const labelUbi = document.getElementById('labelUbicacion');
    const thUbi = document.getElementById('thUbicacion');
    const contenedorPrioridad = document.getElementById('contenedorPrioridad');

    // Inicializar indicador de usuario y fecha en la barra superior
    const elemNombre = document.getElementById('nombreOperador');
    const elemDepto = document.getElementById('labelDeptoActivo');
    const elemFecha = document.getElementById('currentDate');

    if (elemNombre) elemNombre.textContent = sesionActual.nombre;
    if (elemDepto) elemDepto.textContent = sesionActual.departamento;
    if (elemFecha) elemFecha.textContent = new Date().toLocaleDateString('es-MX');

    const inputFecha = document.getElementById('fecha');
    if (inputFecha) inputFecha.valueAsDate = new Date();

    // Configurar interfaz según el rol del usuario conectado
    if (sesionActual.rol === 'bienestar') {
        if (selectTipo) selectTipo.value = "BIENESTAR SOCIAL 2026";
        if (labelUbi) labelUbi.textContent = "Colonia *";
        if (thUbi) thUbi.textContent = "Colonia";
        if (inputColonia) inputColonia.placeholder = "Ej. Belén Grande, El Zapotito";
        if (contenedorPrioridad) contenedorPrioridad.style.display = "block";
    } else if (sesionActual.rol === 'territorio') {
        if (selectTipo) selectTipo.value = "PUEBLO Y TERRITORIO 2026";
        if (labelUbi) labelUbi.textContent = "Localidad *";
        if (thUbi) thUbi.textContent = "Localidad";
        if (inputColonia) inputColonia.placeholder = "Ej. El Salto, El Totoposte";
        if (contenedorPrioridad) contenedorPrioridad.style.display = "none";
    }

    // Escuchar datos en tiempo real de Firestore
    escucharSolicitudes();

    // Guardar Petición
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const tipoGestionVal = selectTipo ? selectTipo.value : '';
            const folioVal = document.getElementById('folio').value.toUpperCase().trim();
            const fechaVal = inputFecha ? inputFecha.value : '';
            const nombreVal = document.getElementById('nombre').value.toUpperCase().trim();
            const cargoVal = document.getElementById('cargo').value;
            const ubicacionVal = inputColonia ? inputColonia.value.toUpperCase().trim() : '';
            const referenciasVal = document.getElementById('referencias').value.trim() || 'S/N';
            const clasificacionVal = document.getElementById('clasificacion').value.toUpperCase().trim();
            const requerimientoVal = document.getElementById('requerimiento').value.toUpperCase().trim();
            const rutaVal = document.getElementById('ruta').value.toUpperCase().trim();
            const detallesVal = document.getElementById('detalles').value.trim();

            const nuevaSolicitud = {
                tipoGestion: tipoGestionVal,
                folio: folioVal,
                fecha: fechaVal,
                nombre: nombreVal,
                cargo: cargoVal,
                referencias: referenciasVal,
                clasificacion: clasificacionVal,
                requerimiento: requerimientoVal,
                detalles: detallesVal,
                ruta: rutaVal,
                status: 'PENDIENTE',
                observaciones: '',
                createdAt: serverTimestamp()
            };

            if (sesionActual.rol === 'bienestar') {
                nuevaSolicitud.colonia = ubicacionVal;
                const inputPrioridad = document.getElementById('prioridad');
                nuevaSolicitud.prioridad = inputPrioridad ? inputPrioridad.value.toUpperCase().trim() || 'NORMAL' : 'NORMAL';
            } else {
                nuevaSolicitud.localidad = ubicacionVal;
            }

            try {
                await addDoc(collection(db, "solicitudes"), nuevaSolicitud);
                alert(`✅ Petición registrada exitosamente con el Folio: ${folioVal} (Estatus: PENDIENTE)`);
                form.reset();
                if (inputFecha) inputFecha.valueAsDate = new Date();
                if (selectTipo) selectTipo.value = sesionActual.rol === 'bienestar' ? "BIENESTAR SOCIAL 2026" : "PUEBLO Y TERRITORIO 2026";
            } catch (error) {
                console.error("Error al guardar:", error);
                alert("❌ Ocurrió un error al guardar la petición.");
            }
        });
    }

    // Buscador en tabla
    if (inputBuscar) {
        inputBuscar.addEventListener('input', () => {
            paginaActual = 1;
            renderizarTabla();
        });
    }

    // Validación de coincidencia de Nombre (Al salir del campo)
    const inputNombre = document.getElementById('nombre');
    if (inputNombre) {
        inputNombre.addEventListener('blur', () => {
            const nombreIngresado = inputNombre.value.trim().toUpperCase();
            if (!nombreIngresado) return;

            const coincidencias = solicitudes.filter(s => s.nombre && s.nombre.toUpperCase() === nombreIngresado);

            if (coincidencias.length > 0) {
                const tbodyCoincidencias = document.getElementById('tablaCoincidenciasBody');
                if (tbodyCoincidencias) {
                    tbodyCoincidencias.innerHTML = coincidencias.map(c => `
                        <tr>
                            <td class="py-2.5 px-3 font-mono font-bold text-emerald-800">${c.folio || 'S/F'}</td>
                            <td class="py-2.5 px-3">${c.fecha || '--'}</td>
                            <td class="py-2.5 px-3 font-medium">${c.requerimiento || 'Sin especificar'}</td>
                            <td class="py-2.5 px-3">
                                <span class="px-2.5 py-1 rounded-full font-bold text-[10px] ${c.status === 'REALIZADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
                                    ${c.status || 'PENDIENTE'}
                                </span>
                            </td>
                        </tr>
                    `).join('');
                }

                const modal = document.getElementById('modalCoincidencia');
                if (modal) modal.classList.remove('hidden');
            }
        });
    }
});

// Listener en Tiempo Real de Firestore
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        solicitudes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        actualizarDatalistsInteligentes();
        renderizarTabla();
    });
}

// Retroalimentar dinámicamente Clasificaciones, Rutas y Prioridades
function actualizarDatalistsInteligentes() {
    const datalistClasif = document.getElementById('listaClasificaciones');
    const datalistRutas = document.getElementById('listaRutas');
    const datalistPrioridades = document.getElementById('listaPrioridades');

    if (datalistClasif) {
        const clasifUnicas = [...new Set(solicitudes.map(s => s.clasificacion).filter(Boolean))].sort();
        datalistClasif.innerHTML = clasifUnicas.map(c => `<option value="${c}">`).join('');
    }

    if (datalistRutas) {
        const rutasUnicas = [...new Set(solicitudes.map(s => s.ruta).filter(Boolean))].sort();
        datalistRutas.innerHTML = rutasUnicas.map(r => `<option value="${r}">`).join('');
    }

    if (datalistPrioridades) {
        const prioridadesUnicas = [...new Set(solicitudes.map(s => s.prioridad).filter(Boolean))].sort();
        datalistPrioridades.innerHTML = prioridadesUnicas.map(p => `<option value="${p}">`).join('');
    }
}

// Renderizado de Tabla con Paginación a 10 filas y Botones de Acción
function renderizarTabla() {
    const tbody = document.getElementById('tablaRecepcionBody');
    if (!tbody) return;

    const busqueda = document.getElementById('buscarRecepcion')?.value.toLowerCase() || '';
    
    // Almacenamos el resultado filtrado en la variable global para la impresión
    ultimosFiltrados = solicitudes.filter(s => {
        const perteneceDepto = sesionActual.rol === 'bienestar' 
            ? s.tipoGestion?.includes('BIENESTAR') 
            : s.tipoGestion?.includes('PUEBLO');

        const cumpleBusqueda = 
            (s.folio && s.folio.toLowerCase().includes(busqueda)) ||
            (s.nombre && s.nombre.toLowerCase().includes(busqueda)) ||
            (s.colonia && s.colonia.toLowerCase().includes(busqueda)) ||
            (s.localidad && s.localidad.toLowerCase().includes(busqueda)) ||
            (s.requerimiento && s.requerimiento.toLowerCase().includes(busqueda)) ||
            (s.clasificacion && s.clasificacion.toLowerCase().includes(busqueda));

        return perteneceDepto && cumpleBusqueda;
    });

    const inicio = (paginaActual - 1) * filasPorPagina;
    const fin = inicio + filasPorPagina;
    const paginados = ultimosFiltrados.slice(inicio, fin);

    tbody.innerHTML = paginados.map(s => {
        const ubi = s.colonia || s.localidad || 'N/D';
        return `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 font-mono font-bold text-emerald-800">${s.folio || 'S/F'}</td>
                <td class="py-3 px-4">${s.fecha || '--'}</td>
                <td class="py-3 px-4">
                    <span class="font-bold text-slate-800 block">${s.nombre || ''}</span>
                    <span class="text-[10px] text-slate-400">${s.cargo || ''}</span>
                </td>
                <td class="py-3 px-4">${ubi}</td>
                <td class="py-3 px-4 font-medium">${s.requerimiento || ''}</td>
                <td class="py-3 px-4"><span class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold text-[10px]">${s.clasificacion || ''}</span></td>
                <td class="py-3 px-4">${obtenerBadgeEstatus(s.status)}</td>
                <td class="py-3 px-4 text-center space-x-2">
                    <button onclick="abrirModalEditar('${s.id}')" class="text-blue-600 hover:text-blue-800 font-bold p-1" title="Editar Solicitud">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button onclick="eliminarSolicitud('${s.id}', '${s.folio || 'S/F'}')" class="text-rose-600 hover:text-rose-800 font-bold p-1" title="Eliminar Solicitud">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderizarPaginador(ultimosFiltrados.length);
}

// Función Global para Imprimir lo Filtrado
window.imprimirFiltrados = () => {
    if (!ultimosFiltrados || ultimosFiltrados.length === 0) {
        alert("No hay registros filtrados para imprimir.");
        return;
    }

    const ventanaImpresion = window.open('', '_blank');
    const tituloDepto = sesionActual.departamento || 'REPORTE DE SOLICITUDES';

    let contenidoHTML = `
        <html>
        <head>
            <title>Reporte de Solicitudes - ${tituloDepto}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 11px; color: #333; margin: 20px; }
                h2 { text-align: center; margin-bottom: 5px; color: #065f46; }
                p { text-align: center; margin-top: 0; color: #666; font-size: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; }
                tr:nth-child(even) { background-color: #f8fafc; }
            </style>
        </head>
        <body>
            <h2>SISTEMA MUNICIPAL DIF - SAN ANDRÉS TUXTLA</h2>
            <p>Reporte filtrado: ${tituloDepto} | Fecha de impresión: ${new Date().toLocaleDateString('es-MX')}</p>
            <table>
                <thead>
                    <tr>
                        <th>Folio</th>
                        <th>Fecha</th>
                        <th>Solicitante / Cargo</th>
                        <th>Ubicación</th>
                        <th>Requerimiento</th>
                        <th>Clasificación</th>
                        <th>Estatus</th>
                    </tr>
                </thead>
                <tbody>
    `;

    ultimosFiltrados.forEach(s => {
        const ubi = s.colonia || s.localidad || 'N/D';
        contenidoHTML += `
            <tr>
                <td><b>${s.folio || 'S/F'}</b></td>
                <td>${s.fecha || '--'}</td>
                <td>${s.nombre || ''} (${s.cargo || ''})</td>
                <td>${ubi}</td>
                <td>${s.requerimiento || ''}</td>
                <td>${s.clasificacion || ''}</td>
                <td><b>${s.status || 'PENDIENTE'}</b></td>
            </tr>
        `;
    });

    contenidoHTML += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    ventanaImpresion.document.write(contenidoHTML);
    ventanaImpresion.document.close();
    ventanaImpresion.focus();
    setTimeout(() => {
        ventanaImpresion.print();
        ventanaImpresion.close();
    }, 500);
};

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

// Funciones Globales para Cargar y Guardar la Edición Completa de Todos los Campos
window.abrirModalEditar = (id) => {
    const solicitud = solicitudes.find(s => s.id === id);
    if (!solicitud) return;

    // Asignar cada propiedad de la solicitud a su campo respectivo en el modal
    document.getElementById('editId').value = solicitud.id;
    document.getElementById('editFolio').value = solicitud.folio || '';
    document.getElementById('editFecha').value = solicitud.fecha || '';
    document.getElementById('editNombre').value = solicitud.nombre || '';
    document.getElementById('editCargo').value = solicitud.cargo || 'CIUDADANO';
    
    // Gestionar dinámicamente si corresponde a Colonia (Bienestar) o Localidad (Territorio)
    const labelEditUbi = document.getElementById('editLabelUbi');
    const inputEditColonia = document.getElementById('editColonia');
    if (solicitud.colonia !== undefined) {
        if (labelEditUbi) labelEditUbi.textContent = "Colonia *";
        inputEditColonia.value = solicitud.colonia || '';
    } else {
        if (labelEditUbi) labelEditUbi.textContent = "Localidad *";
        inputEditColonia.value = solicitud.localidad || '';
    }

    document.getElementById('editReferencias').value = solicitud.referencias || '';
    document.getElementById('editClasificacion').value = solicitud.clasificacion || '';
    document.getElementById('editRequerimiento').value = solicitud.requerimiento || '';
    document.getElementById('editRuta').value = solicitud.ruta || '';
    
    const contenedorPrioridadEdit = document.getElementById('editContainerPrioridad');
    if (solicitud.prioridad !== undefined) {
        if (contenedorPrioridadEdit) contenedorPrioridadEdit.style.display = "block";
        document.getElementById('editPrioridad').value = solicitud.prioridad || '';
    } else {
        if (contenedorPrioridadEdit) contenedorPrioridadEdit.style.display = "none";
    }

    document.getElementById('editDetalles').value = solicitud.detalles || '';

    // Mostrar modal
    document.getElementById('modalEditar').classList.remove('hidden');
};

window.cerrarModalEditar = () => {
    document.getElementById('modalEditar').classList.add('hidden');
};

window.guardarEdicion = async (e) => {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    
    // Recopilar todos los valores modificados del formulario del modal
    const fecha = document.getElementById('editFecha').value;
    const nombre = document.getElementById('editNombre').value.toUpperCase().trim();
    const cargo = document.getElementById('editCargo').value;
    const valorUbicacion = document.getElementById('editColonia').value.toUpperCase().trim();
    const referencias = document.getElementById('editReferencias').value.trim() || 'S/N';
    const clasificacion = document.getElementById('editClasificacion').value.toUpperCase().trim();
    const requerimiento = document.getElementById('editRequerimiento').value.toUpperCase().trim();
    const ruta = document.getElementById('editRuta').value.toUpperCase().trim();
    const detalles = document.getElementById('editDetalles').value.trim();

    const datosActualizados = {
        fecha,
        nombre,
        cargo,
        referencias,
        clasificacion,
        requerimiento,
        ruta,
        detalles
    };

    // Actualizar colonia o localidad y prioridad según corresponda al registro original
    const solicitudOriginal = solicitudes.find(s => s.id === id);
    if (solicitudOriginal && solicitudOriginal.colonia !== undefined) {
        datosActualizados.colonia = valorUbicacion;
        const inputPrioridadEdit = document.getElementById('editPrioridad');
        datosActualizados.prioridad = inputPrioridadEdit ? inputPrioridadEdit.value.toUpperCase().trim() || 'NORMAL' : 'NORMAL';
    } else {
        datosActualizados.localidad = valorUbicacion;
    }

    try {
        const docRef = doc(db, "solicitudes", id);
        await updateDoc(docRef, datosActualizados);

        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("✅ Solicitud actualizada completamente", "success");
        } else {
            alert("✅ Solicitud actualizada completamente.");
        }
        cerrarModalEditar();
    } catch (error) {
        console.error("Error al actualizar:", error);
        if (window.mostrarNotificacion) {
            window.mostrarNotificacion("❌ No se pudo actualizar el registro", "error");
        } else {
            alert("❌ No se pudo actualizar el registro.");
        }
    }
};

window.eliminarSolicitud = async (id, folio) => {
    if (confirm(`¿Estás seguro de eliminar permanentemente la solicitud con Folio: ${folio}?`)) {
        try {
            await deleteDoc(doc(db, "solicitudes", id));
            alert("🗑️ Solicitud eliminada correctamente de Firebase.");
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("❌ Ocurrió un error al intentar eliminar el registro.");
        }
    }
};

function renderizarPaginador(totalItems) {
    const totalPaginas = Math.ceil(totalItems / filasPorPagina) || 1;
    const contenedor = document.getElementById('paginadorRecepcion');
    if(!contenedor) return;

    contenedor.innerHTML = `
        <div>Mostrando <span class="font-bold text-slate-700">${totalItems > 0 ? (paginaActual - 1) * filasPorPagina + 1 : 0}</span> a <span class="font-bold text-slate-700">${Math.min(paginaActual * filasPorPagina, totalItems)}</span> de <span class="font-bold text-slate-700">${totalItems}</span></div>
        <div class="flex items-center space-x-2">
            <button onclick="cambiarPagina(${paginaActual - 1})" ${paginaActual === 1 ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Anterior</button>
            <span class="px-3 py-1.5 bg-emerald-700 text-white font-bold rounded">${paginaActual} / ${totalPaginas}</span>
            <button onclick="cambiarPagina(${paginaActual + 1})" ${paginaActual >= totalPaginas ? 'disabled' : ''} class="px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-50">Siguiente</button>
        </div>
    `;
}

window.cambiarPagina = (nuevaPagina) => {
    paginaActual = nuevaPagina;
    renderizarTabla();
};
