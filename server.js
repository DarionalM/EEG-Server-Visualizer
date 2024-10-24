const express = require('express');
const http = require('http');
const path = require('path');
const socketIO = require('socket.io');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);  // Crear servidor HTTP
const io = socketIO(server,{
  cors: {
    origin: "*",  // Permite conexiones desde cualquier origen
    methods: ["GET", "POST"]
  }});  // Integrar Socket.io con el servidor HTTP

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');  // Permitir todas las solicitudes
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Iniciar el servidor HTTP y Socket.io en el mismo puerto
server.listen(3001, '192.168.1.112', () => {
  console.log('Servidor HTTP y Socket.io corriendo en http://192.168.1.112:3001');
});

// Socket.io para la comunicación en tiempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado para visualización gráfica');

  socket.on('eegData', (data) => {
    io.emit('updateGraph', data);  // Envía los datos a todos los clientes conectados
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });

  socket.on('error', (error) => {
    console.error('Error en la conexión Socket.io:', error);
  });
});

// WebSocket Server para recibir los datos del celular (puerto 3000)
const wsServer = new WebSocket.Server({ host:'192.168.1.112', port: 3000 });

wsServer.on('connection', (socket) => {
  console.log('Nuevo cliente WebSocket conectado');

  socket.on('message', (message) => {
    try {
      // Suponemos que el mensaje recibido es un Buffer (binario)
      if (Buffer.isBuffer(message) && message.length === 33) {
        const packet = Buffer.from(message);  // Convertir el mensaje a buffer
        console.log('Mensaje crudo recibido:', message);
        // Decodificar el paquete de 33 bytes (usando tu lógica de decodificación)
        const { eegChannels, additionalData, stopByte } = decodePacket(packet);

        // Crear un objeto con los datos decodificados
        const decodedMessage = {
          eegChannels: eegChannels,
          additionalData: additionalData,
          stopByte: stopByte
        };
        
        console.log('Datos decodificados (Canales EEG):', eegChannels);
        console.log('Datos Adicionales:', additionalData);
        console.log('StopByte:', stopByte);


        // Envía el paquete decodificado al cliente a través de Socket.io
        io.emit('updateGraph', decodedMessage);  // Envía los datos a Socket.io

        // Enviar confirmación al cliente WebSocket
        socket.send(`Echo: Paquete recibido y decodificado`);
      } else {
        console.error('El mensaje recibido no tiene el formato esperado o longitud incorrecta');
      }
    } catch (error) {
      console.error('Error al procesar el mensaje:', error);
    }
  });


  socket.on('close', () => {
    console.log('Cliente WebSocket desconectado');
  });

  socket.on('error', (error) => {
    console.error('Error en la conexión WebSocket:', error);
  });
});



function decodePacket(packet) {
  const eegChannels = [];
  for (let i = 0; i < 8; i++) {
    const startIndex = 2 + i * 3; // Los bytes para los canales EEG
    const eegValue = decode24BitSigned(packet.slice(startIndex, startIndex + 3));
    eegChannels.push(eegValue);
  }
  // Decodificamos StopByte
  const decodedstopByte = stopByte(packet);

  let additionalData;
  if (decodedstopByte === 0xC0) {
    // Datos de aceleración (AX, AY, AZ)
    const accelerationX = decode16BitSigned(packet.slice(26, 28));
    const accelerationY = decode16BitSigned(packet.slice(28, 30));
    const accelerationZ = decode16BitSigned(packet.slice(30, 32));
    additionalData = [accelerationX, accelerationY, accelerationZ];
  } else if (decodedstopByte === 0xC1 || decodedstopByte === 0xC2) {
    // Datos UDF (valores indefinidos que podrías definir según tu caso)
    const udf1 = decodeByteSigned(packet[26]);
    const udf2 = decodeByteSigned(packet[27]);
    const udf3 = decodeByteSigned(packet[28]);
    const udf4 = decodeByteSigned(packet[29]);
    const udf5 = decodeByteSigned(packet[30]);
    const udf6 = decodeByteSigned(packet[31]);
    additionalData = [udf1, udf2, udf3, udf4, udf5, udf6];
  } else if (decodedstopByte === 0xC3 || decodedstopByte === 0xC4) {
    // Datos de AC, AV y el Timestamp
    const ac = decodeByteSigned(packet[26]);
    const av = decodeByteSigned(packet[27]);
    const timeStamp = decodeTime(packet.slice(28, 32));
    additionalData = [ac, av, timeStamp];
  } else if (decodedstopByte === 0xC5 || decodedstopByte === 0xC6) {
    // Datos de udf1, udf2 y el Timestamp
    const udf1 = decodeByteSigned(packet[26]);
    const udf2 = decodeByteSigned(packet[27]);
    const timeStamp = decodeTime(packet.slice(28, 32));
    additionalData = [udf1, udf2, timeStamp];
  } else {
    console.error('StopByte no soportado:', decodedstopByte.toString(16));
    additionalData = [0, 0, 0, 0, 0, 0]; // Default si el stop byte no es soportado
  }

  

  return {
    eegChannels: eegChannels,
    additionalData: additionalData,
    stopByte: decodedstopByte,
  };
}

// Decodifica 24 bits firmados
function decodeTime(bytes) {
  let value = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  return value >>> 0;
}

// Decodifica 24 bits firmados
function decode24BitSigned(bytes) {
  let value = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
  return (value & 0x800000) ? value | 0xFF000000 : value;
}

// Decodifica 16 bits firmados
function decode16BitSigned(bytes) {
  let newInt = (
    ((0xFF & bytes[0]) << 8) |  // Desplaza el primer byte 8 bits hacia la izquierda
    (0xFF & bytes[1])           // Combina el segundo byte
  );
  // Si el bit de signo (bit 15) está encendido, extiende el signo para un número de 32 bits
  if ((newInt & 0x00008000) > 0) {
    newInt |= 0xFFFF0000;  // Extiende el signo llenando los 16 bits superiores con 1s
  } else {
    newInt &= 0x0000FFFF;  // Asegura que los bits superiores se mantengan en 0
  }

  return newInt;
}

// Decodifica el StopByte
function stopByte(packet) {
  // El byte 33 es el índice 32
  const stopByte = packet[32];
  
  // Verificar si el StopByte está en el rango esperado (0xC0 a 0xCF)
  if ((stopByte & 0xF0) === 0xC0) {
    console.log('StopByte válido:', stopByte.toString(16));
    return stopByte;
  } else {
    console.error('StopByte no válido:', stopByte.toString(16));
    return null;  // Devuelve null si el StopByte no es válido
  }
}

function decodeByteSigned(byte) {
  // Convertimos el byte a un entero de 8 bits
  let intValue = byte & 0xFF;  // Asegurarse de obtener solo los últimos 8 bits

  // Si el valor es mayor o igual a 128 (bit de signo encendido), extender el signo
  if (intValue & 0x80) {
      // El número es negativo, extender el signo
      intValue = intValue - 256;
  }

  return intValue;
}

