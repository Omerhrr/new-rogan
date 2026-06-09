import { Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function setSocketRef(socket: Socket) {
  socketInstance = socket;
}

export function getSocketRef(): Socket | null {
  return socketInstance;
}

export function clearSocketRef() {
  socketInstance = null;
}

export function socketEmitWithAck(event: string, data?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!socketInstance) {
      reject(new Error('Socket not connected'));
      return;
    }
    if (!socketInstance.connected) {
      reject(new Error('Socket not connected'));
      return;
    }
    socketInstance.emit(event, data, (response: any) => {
      if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}
