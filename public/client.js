const socket = io('http://192.168.1.112:3001');  // Conectar al servidor de gráficos en puerto 3001

let allEEGData = [];  // Almacenar todos los datos recibidos
let all10EEGData = [];
let channels = ['Canal1', 'Canal2', 'Canal3', 'Canal4', 'Canal5', 'Canal6', 'Canal7', 'Canal8'];  // Nombres de los canales
let additionalChannels = ['Undefined1', 'Undefined2', 'Undefined3', 'Undefined4', 'Undefined5', 'Undefined6'];  // Canales adicionales (inicialmente indefinidos)
let eegDataByChannel = channels.map(() => []);  // Lista para almacenar datos por canal
let additionalDataByChannel = additionalChannels.map(() => []);  // Datos para los canales adicionales
let dataLength = 500;  // Número de puntos a mostrar en el gráfico
let axisHeight = 65;  // Altura de cada "canal"
let axisTop = 50;  // Espaciado inicial desde la parte superior
let stopByteProcessed = false;  // Bandera para asegurar que solo cambiemos los nombres una vez

// Crear los ejes Y para los canales EEG y adicionales
let yAxis = [...channels, ...additionalChannels].map((channel, i) => ({
    title: { text: channel },
    height: axisHeight,
    top: axisTop + i * (axisHeight + 20),
    offset: 0,
    lineWidth: 1
}));


function calculateChartHeight() {
    let totalChannels = channels.length + additionalChannels.length;  // Total de canales
    let heightPerChannel = axisHeight + 25;  // Incrementa el espacio para asegurar que haya suficiente altura por canal
    return totalChannels * heightPerChannel;  // Altura total del gráfico
}

// Inicializar Highcharts con la altura dinámica
let chart = Highcharts.chart('container', {
    chart: {
        height: calculateChartHeight(),  // Altura dinámica
        type: 'line',
        animation: false,
        zoomType: 'x'  // Permitir zoom horizontal en los datos
    },
    title: { text: 'Visualización en tiempo real de señales EEG' },
    xAxis: {
        visible: false,
        categories: Array.from({ length: dataLength }, (_, i) => i),
        title: { text: 'Tiempo' }
    },
    legend: {
        enabled: false
    },
    yAxis: yAxis,
    tooltip: { shared: true, crosshairs: true },
    plotOptions: {
        line: {
            marker: { enabled: false }
        }
    },
    exporting: { enabled: true },
    series: []  // Inicializamos la configuración de series vacía
});




// Añadir las series EEG y adicionales a Highcharts
[...channels, ...additionalChannels].forEach((channel, i) => {
    chart.addSeries({
        name: channel,
        data: Array(dataLength).fill(null),
        yAxis: i
    });
});

// Función para actualizar los nombres de los canales adicionales solo una vez
function updateChannelNames(stopByte) {
    if (stopByteProcessed) return;  // Si ya se actualizaron, no hacer nada

    if (stopByte === 192) {
        additionalChannels = ['Aceleración X', 'Aceleración Y', 'Aceleración Z', 'Sin Conexión', 'Sin Conexión', 'Sin Conexión'];
    } else if (stopByte === 193 || stopByte === 194) {
        additionalChannels = ['Extra 1', 'Extra 2', 'Extra 3', 'Extra 4', 'Extra 5', 'Extra 6'];
    } else if (stopByte === 195 || stopByte === 196) {
        additionalChannels = ['AC', 'AV', 'Sin Conexión', 'Sin Conexión', 'Sin Conexión', 'Sin Conexión'];
    } else if (stopByte === 197 || stopByte === 198) {
        additionalChannels = ['Extra 1', 'Extra 2', 'Sin Conexión', 'Sin Conexión', 'Sin Conexión', 'Sin Conexión'];
    }

    // Actualizar los títulos de los canales en el gráfico
    additionalChannels.forEach((channel, i) => {
        chart.yAxis[channels.length + i].update({ title: { text: channel } });
    });

    stopByteProcessed = true;  // Marcar que los nombres han sido actualizados
}

// Actualizar el gráfico en tiempo real cuando se reciban nuevos datos
socket.on('updateGraph', (decodedMessage) => {
    console.log("Datos recibidos del servidor:", decodedMessage);
    allEEGData.push(decodedMessage);  // Guardar los datos recibidos
    all10EEGData.push(decodedMessage);

    if (all10EEGData.length >= 10) {
        all10EEGData.forEach((dataPacket) => {
            let stopByte = dataPacket.stopByte;  // Obtener el StopByte directamente

            updateChannelNames(stopByte);  // Actualizar los nombres de los canales adicionales solo una vez

            // Procesar los datos EEG (canales 1-8)
            dataPacket.eegChannels.forEach((value, i) => {
                eegDataByChannel[i].push(value);
                let channelData = chart.series[i].data.map(point => point ? point.y : null);
                channelData.push(value);
                if (channelData.length > dataLength) channelData.shift();
                chart.series[i].setData(channelData, false);
            });

            // Procesar los datos adicionales basados en el StopByte
            if (stopByte === 0xC0){
                additionalDataByChannel[0].push(dataPacket.additionalData[0]);  // AC
                additionalDataByChannel[1].push(dataPacket.additionalData[2]);  // AC
                additionalDataByChannel[2].push(dataPacket.additionalData[1]);  // AV

                for (let i = 0; i < 3; i++) {
                    let channelData = chart.series[channels.length + i].data.map(point => point ? point.y : null);
                    channelData.push(dataPacket.additionalData[i]);
                    if (channelData.length > dataLength) channelData.shift();
                    chart.series[channels.length + i].setData(channelData, false);
                }
            } else if (stopByte === 0xC1 || stopByte === 0xC2) {
                // Datos de AC, AV y Timestamp
                additionalDataByChannel[0].push(dataPacket.additionalData[0]);  // AC
                additionalDataByChannel[1].push(dataPacket.additionalData[1]);  // AV
                additionalDataByChannel[2].push(dataPacket.additionalData[2]);  // AC
                additionalDataByChannel[3].push(dataPacket.additionalData[3]);  // AV
                additionalDataByChannel[4].push(dataPacket.additionalData[4]);  // AC
                additionalDataByChannel[5].push(dataPacket.additionalData[5]);  // AV

                for (let i = 0; i < 6; i++) {
                    let channelData = chart.series[channels.length + i].data.map(point => point ? point.y : null);
                    channelData.push(dataPacket.additionalData[i]);
                    if (channelData.length > dataLength) channelData.shift();
                    chart.series[channels.length + i].setData(channelData, false);
                }
            } else if (stopByte === 0xC3 || stopByte === 0xC4) {
                // Datos de AC, AV y Timestamp
                additionalDataByChannel[0].push(dataPacket.additionalData[0]);  // AC
                additionalDataByChannel[1].push(dataPacket.additionalData[1]);  // AV

                for (let i = 0; i < 2; i++) {
                    let channelData = chart.series[channels.length + i].data.map(point => point ? point.y : null);
                    channelData.push(dataPacket.additionalData[i]);
                    if (channelData.length > dataLength) channelData.shift();
                    chart.series[channels.length + i].setData(channelData, false);
                }
            } else if (stopByte === 0xC5 || stopByte === 0xC6) {
                // Datos de UDF y Timestamp
                additionalDataByChannel[0].push(dataPacket.additionalData[0]);  // UDF 1
                additionalDataByChannel[1].push(dataPacket.additionalData[1]);  // UDF 2

                for (let i = 0; i < 2; i++) {
                    let channelData = chart.series[channels.length + i].data.map(point => point ? point.y : null);
                    channelData.push(dataPacket.additionalData[i]);
                    if (channelData.length > dataLength) channelData.shift();
                    chart.series[channels.length + i].setData(channelData, false);
                }
            }
        });

        chart.redraw();  // Redibujar la gráfica con los datos nuevos
        all10EEGData = [];
    }
});


// Función para descargar los datos como archivo TXT
function downloadData() {
    let content = '';  // Comenzamos con una cadena vacía

    allEEGData.forEach((data) => {
        content += data.join(',') + '\n';  // Unir los valores separados por coma y añadir una nueva línea al final
    });

    // Descargar el archivo TXT
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'EEG_data.csv';  // Cambia la extensión a .txt si es necesario
    a.click();
    URL.revokeObjectURL(url);
}

function createGlobalChart() {
    setTimeout(() => {
        // Inicializamos las series vacías para los canales y datos adicionales
        let globalSeries = [...channels, ...additionalChannels].map(() => Array(allEEGData.length).fill(null));

        // Recorrer todos los datos almacenados en allEEGData
        allEEGData.forEach((dataPacket, index) => {
            // Agregar los datos de los canales EEG (1-8)
            for (let i = 0; i < channels.length; i++) {
                globalSeries[i][index] = dataPacket.eegChannels[i];
            }

            // Agregar los datos adicionales (si los hay)
            for (let i = 0; i < additionalChannels.length; i++) {
                globalSeries[channels.length + i][index] = dataPacket.additionalData[i];
            }
        });

        // Crear el gráfico "invisible" con los datos acumulados
        const chart = Highcharts.chart({
            chart: {
                height: calculateChartHeight(),
                type: 'line',
                animation: false,
                zoomType: 'x',
                renderTo: document.createElement('div'),  // Crear el gráfico sin renderizarlo en la página
            },
            title: { text: 'Datos EEG y Adicionales Acumulados' },
            xAxis: {
                categories: Array.from({ length: allEEGData.length }, (_, i) => i),
                title: { text: 'Índice de Tiempo' }
            },
            legend: {
                enabled: false
            },
            yAxis: yAxis,  // Los ejes y para los canales EEG y adicionales
            tooltip: { shared: true, crosshairs: true },
            plotOptions: {
                line: {
                    marker: { enabled: false }
                }
            },
            exporting: {
                enabled: true,  // Activamos la opción de exportar
            },
            series: globalSeries.map((data, index) => ({
                name: index < channels.length ? channels[index] : additionalChannels[index - channels.length],
                data: data
            }))
        });

        // Esperamos que el gráfico esté completamente renderizado antes de exportarlo
        setTimeout(() => {
            chart.exportChart({
                type: 'image/png',
                filename: 'EEG_data_chart'
            });
        }, 500);  // Añadimos un retraso para asegurar que el gráfico se ha renderizado
    }, 1);  // Simular un retraso de 1 ms para la demostración
}
