import { connect } from 'cloudflare:sockets';

// متغیرها
let userID = 'f0f89313-b1aa-4f45-af62-396f18616f83';
const PoxyIPs = ['ts.hpc.tw','cdn.xn--b6gac.eu.org', 'cdn-all.xn--b6gac.eu.org', 'workers.cloudflare.cyou'];
let PoxyIP = 'ts.hpc.tw';
let dohURL = 'https://sky.rethinkdns.com/1:-Pf_____9_8A_AMAIgE8kMABVDDmKOHTAKg=';

// توابع کمکی
async function getFromSAM(key, SamSoft) {
    return (await SamSoft.get(key)) || '';
}

async function saveToSAM(key, value, SamSoft) {
    return await SamSoft.put(key, value);
}

const regexes = {
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  telegramId: /^[0-9]+$/
};

const lengths = {
  uuid: 36,
  telegramId: 15
};

function isValidInput(input, type) {
  return regexes[type].test(input) && input.length <= lengths[type];
}

// توابع عملیات کاربران
async function addUser(username, uuid, expirationTimestamp, telegramId, SamSoft) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);
  let userCounter = parseInt(await getFromSAM('UserCounter', SamSoft), 10) || 1000;

  const uuidEntry = `{${username}:${uuid}:${expirationTimestamp}:${telegramId}}`;

  if (existingUUIDs.includes(uuid)) {
    return new Response(`کاربر ${uuid} از قبل وجود دارد ❗`);
  } else {
    existingUUIDs = existingUUIDs ? `${existingUUIDs},${uuid}` : uuid;
    userDataBase = userDataBase ? `${userDataBase},${uuidEntry}` : uuidEntry;
  }

  await saveToSAM('UUID', existingUUIDs, SamSoft);
  await saveToSAM('UserDataBase', userDataBase, SamSoft);
  await saveToSAM('UserCounter', (userCounter + 1).toString(), SamSoft);
  return new Response('کاربر جدید با اعتبار افزوده شد.\n');
}

async function getUsername(uuid, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);
  const userEntry = userDataBase.split(',').find(entry => entry.includes(uuid));
  if (userEntry) {
    const [username] = userEntry.split(':');
    return new Response(username);
  }
  return new Response('نام کاربری یافت نشد ❗', { status: 404 });
}

async function getUserCounter(SamSoft) {
  return new Response(await getFromSAM('UserCounter', SamSoft) || '1000');
}

async function checkUserByTelegramId(telegramId, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  if (userDataBase) {
    userDataBase = userDataBase.replace(/['"]/g, '');

    const userEntries = userDataBase.split('},{').filter(entry => {
      const parts = entry.replace(/{|}/g, '').split(':');
      return parts[3] === telegramId;
    });

    if (userEntries.length > 0) {
      return new Response(userEntries.join('},{'));
    }
  }
  return new Response('هیچ کاربری با این شناسه تلگرام یافت نشد ❗', { status: 404 });
}

async function findByUsername(username, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);
  const userEntries = userDataBase.split(',').filter(entry => entry.includes(username));
  if (userEntries.length > 0) {
    return new Response(userEntries.join(','));
  }
  return new Response('هیچ اشتراکی با این نام کاربری یافت نشد ❗', { status: 404 });
}

async function findUser(term, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  if (userDataBase) {
    userDataBase = userDataBase.replace(/['"]/g, '');

    const userEntries = userDataBase.split('},{').filter(entry => entry.includes(term));
    if (userEntries.length > 0) {
      return new Response(userEntries.map(entry => entry.replace(/{|}/g, '')).join('},{'));
    }
  }
  return new Response('هیچ کاربری با این اطلاعات یافت نشد ❗', { status: 404 });
}

async function checkUUID(uuid, SamSoft) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  if (existingUUIDs.includes(uuid)) {
    return new Response('UUID exists.', { status: 200 });
  }
  return new Response('UUID does not exist.', { status: 404 });
}

async function activateSubscription(uuid, SamSoft) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  if (existingUUIDs.includes(uuid)) {
    return new Response('این اشتراک قبلاً فعال شده است.', { status: 400 });
  }

  existingUUIDs = existingUUIDs ? `${existingUUIDs},${uuid}` : uuid;

  let userEntries = userDataBase.split(',').map(entry => {
    if (entry.includes(uuid)) {
      const parts = entry.split(':');
      parts[0] = parts[0].replace(' 🚫', '');
      return `{${parts.join(':')}}`;
    }
    return entry;
  });

  await saveToSAM('UUID', existingUUIDs, SamSoft);
  await saveToSAM('UserDataBase', userEntries.join(','), SamSoft);
  return new Response('اشتراک با موفقیت فعال شد.');
}

async function deactivateSubscription(uuid, SamSoft) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  if (!existingUUIDs.includes(uuid)) {
    return new Response('این اشتراک قبلاً غیرفعال شده است.', { status: 400 });
  }

  existingUUIDs = existingUUIDs.split(',').filter(item => item !== uuid).join(',');

  let userEntries = userDataBase.split(',').map(entry => {
    if (entry.includes(uuid)) {
      const parts = entry.split(':');
      parts[0] = parts[0].replace(/['"]/g, '') + ' 🚫';
      return `{${parts.join(':')}}`;
    }
    return entry;
  });

  await saveToSAM('UUID', existingUUIDs, SamSoft);
  await saveToSAM('UserDataBase', userEntries.join(','), SamSoft);
  return new Response('اشتراک با موفقیت غیرفعال شد.');
}

async function deleteUser(uuid, SamSoft) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  const uuidList = existingUUIDs.split(',').filter(item => item !== uuid);
  const userList = userDataBase.split(',').filter(item => !item.includes(uuid));

  await saveToSAM('UUID', uuidList.join(','), SamSoft);
  await saveToSAM('UserDataBase', userList.join(','), SamSoft);
  return new Response(`کاربر ${uuid} باموفقیت حذف شد ❌`);
}

async function listUsers(sort = false, showInactiveOnly = false, sortByTime = false, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  if (userDataBase) {
    userDataBase = userDataBase.replace(/[{}]/g, '');
    let userEntries = userDataBase.split(',');

    if (showInactiveOnly) {
      userEntries = userEntries.filter(entry => entry.includes('🚫'));
    } else if (sortByTime) {
      userEntries = userEntries.filter(entry => !entry.includes('🚫'));
      userEntries.sort((a, b) => {
        const aTime = parseInt(a.split(':')[2]);
        const bTime = parseInt(b.split(':')[2]);
        return aTime - bTime;
      });
    } else if (sort) {
      userEntries.reverse();
    }
  }
}

async function cleanupExpiredUUIDs(SamSoft, all = false) {
  let existingUUIDs = await getFromSAM('UUID', SamSoft);
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);

  const now = Date.now();
  const expiredUUIDs = existingUUIDs.split(',').filter(uuid => {
    const expirationEntry = userDataBase.split(',').find(entry => entry.includes(uuid));
    if (expirationEntry) {
      const expirationTimestamp = parseInt(expirationEntry.split(':')[2].replace(/['"]/g, ''), 10);
      return expirationTimestamp <= now;
    }
    return false;
  });

  const updatedUUIDList = existingUUIDs.split(',').filter(uuid => !expiredUUIDs.includes(uuid));
  await saveToSAM('UUID', updatedUUIDList.join(','), SamSoft);

  let userEntries = userDataBase.split(',');
  userEntries = userEntries.map(entry => {
    const parts = entry.split(':');
    const uuid = parts[1];
    if (expiredUUIDs.includes(uuid)) {
      parts[0] = parts[0].replace(/['"]/g, '') + ' 🚫';
      entry = `{${parts.join(':')}}`;
    }
    return entry;
  });

  await saveToSAM('UserDataBase', userEntries.join(','), SamSoft);

  if (all) {
    const updatedUserDataBase = userDataBase.split(',').filter(entry => {
      const expirationTimestamp = parseInt(entry.split(':')[2].replace(/['"]/g, ''), 10);
      return expirationTimestamp > now;
    });
    await saveToSAM('UserDataBase', updatedUserDataBase.join(','), SamSoft);
    return new Response('کاربران منقضی‌ بطور کامل از تمامی پایگاه‌های داده حذف شدند.');
  }

  return new Response('اشتراک‌های منقضی پاک‌سازی شد.');
}

async function editUser(uuid, days, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + days);
  const expirationTimestamp = expirationDate.getTime();

  const userEntryIndex = userDataBase.split(',').findIndex(entry => entry.includes(uuid));
  if (userEntryIndex >= 0) {
    let userEntries = userDataBase.split(',');
    let [username, , , telegramId] = userEntries[userEntryIndex].replace(/[{}]/g, '').split(':');
    userEntries[userEntryIndex] = `{${username}:${uuid}:${expirationTimestamp}:${telegramId}}`;
    await saveToSAM('UserDataBase', userEntries.join(','), SamSoft);
    return new Response(`کاربر با UUID ${uuid} باموفقیت ویرایش شد.`);
  }
  return new Response('کاربری با این UUID یافت نشد ❗', { status: 404 });
}

// توابع مدیریت شناسه تلگرام
async function getTelegramId(uuid, SamSoft) {
  let userDataBase = await getFromSAM('UserDataBase', SamSoft);
  const userEntry = userDataBase.split(',').find(entry => entry.includes(uuid));
  if (userEntry) {
    const [, , , telegram_id] = userEntry.split(':');
    return new Response(telegram_id);
  }
  return new Response('شناسه تلگرام یافت نشد ❗', { status: 404 });
}

// توابع مدیریت درخواست‌ها
async function updateUserData(uuid, field, value, SamSoft) {
    let userDataBase = await getFromSAM('UserDataBase', SamSoft);
    const userEntryIndex = userDataBase.split(',').findIndex(entry => entry.includes(uuid));

    if (userEntryIndex >= 0) {
        let userEntries = userDataBase.split(',');
        let userEntryParts = userEntries[userEntryIndex].replace(/[{}]/g, '').split(':');
        let oldUUID = userEntryParts[1];

        switch (field) {
            case 'username':
                userEntryParts[0] = value.replace(/"/g, '');
                break;
            case 'uuid':
                userEntryParts[1] = value.replace(/"/g, '');
                break;
            case 'expirationTimestamp':
                userEntryParts[2] = value.replace(/"/g, '');
                break;
            case 'telegramId':
                userEntryParts[3] = value.replace(/"/g, '');
                break;
        }

        userEntries[userEntryIndex] = `{${userEntryParts.join(':')}}`;
        await saveToSAM('UserDataBase', userEntries.join(','), SamSoft);

        if (field === 'uuid') {
            let existingUUIDs = await getFromSAM('UUID', SamSoft);
            let uuidList = existingUUIDs.split(',').filter(item => item !== oldUUID);
            uuidList.push(value.replace(/"/g, ''));
            await saveToSAM('UUID', uuidList.join(','), SamSoft);
        }

        return new Response(`مقدار ${field} برای کاربر با UUID ${uuid} باموفقیت به‌روزرسانی شد.`);
    }
    return new Response('کاربری با این UUID یافت نشد ❗', { status: 404 });
}

async function handleRequest(request, SamSoft) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const uuid = searchParams.get('uuid');
  const field = searchParams.get('field');
  const value = searchParams.get('value');
  const expiration_timestamp = searchParams.get('expiration_timestamp');
  const telegramId = searchParams.get('telegram_id');
  const term = searchParams.get('term');
  const username = searchParams.get('username');
  const days = parseInt(searchParams.get('days'), 10);

  try {
    switch (action) {
      case 'add':
        if (isValidInput(uuid, 'uuid') && expiration_timestamp && username) {
          if (telegramId && !isValidInput(telegramId, 'telegramId')) {
            return new Response('شناسه تلگرام نامعتبر است ❗', { status: 400 });
          }
          return await addUser(username, uuid, parseInt(expiration_timestamp), telegramId, SamSoft);
        }
        break;
      case 'check_uuid':
        if (uuid) return await checkUUID(uuid, SamSoft);
        break;
      case 'activate_subscription':
        if (uuid) return await activateSubscription(uuid, SamSoft);
        break;
      case 'deactivate_subscription':
        if (uuid) return await deactivateSubscription(uuid, SamSoft);
        break;
      case 'find':
        if (term) return await findUser(term, SamSoft);
        break;
      case 'get_username':
        if (uuid) return await getUsername(uuid, SamSoft);
        break;
      case 'get_user_counter':
        return await getUserCounter(SamSoft);
      case 'find_by_username':
        if (username) return await findByUsername(username, SamSoft);
        break;
      case 'delete':
        if (uuid) return await deleteUser(uuid, SamSoft);
        break;
      case 'check':
        return await checkUserByTelegramId(telegramId, SamSoft); 
      case 'list':
        return await listUsers(false, false, false, SamSoft);
      case 'cleanup':
        return await cleanupExpiredUUIDs(SamSoft);
      case 'cleanup_all':
        return await cleanupExpiredUUIDs(SamSoft, true);
      case 'edit':
        if (uuid && !isNaN(days)) return await editUser(uuid, days, SamSoft);
        break;
      case 'update_user_data':
        if (uuid && field && value) return await updateUserData(uuid, field, value, SamSoft);
        break;
    }
    return new Response('دستور اشتباه است یا کاربر وجود ندارد ❗', { status: 400 });
  } catch (error) {
    return new Response('خطایی در پردازش درخواست رخ داده است ❗', { status: 500 });
  }
}

// توابع اتصال و مدیریت پروکسی و وب‌سوکت‌ها
async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, VLessResponseHeader, log) {

    async function connectAndWrite(address, port) {
        const tcpSocket = connect({
            hostname: address,
            port: port,
        });
        remoteSocket.value = tcpSocket;
        log(`connected to ${address}:${port}`);
        const writer = tcpSocket.writable.getWriter();
        await writer.write(rawClientData); 
        writer.releaseLock();
        return tcpSocket;
    }

    async function retry() {
        const tcpSocket = await connectAndWrite(PoxyIP || addressRemote, portRemote);
        tcpSocket.closed.catch(error => {
            console.log('retry tcpSocket closed error', error);
        }).finally(() => {
            safeCloseWebSocket(webSocket);
        });
        remoteSocketToWS(tcpSocket, webSocket, VLessResponseHeader, null, log);
    }

    const tcpSocket = await connectAndWrite(addressRemote, portRemote);

    remoteSocketToWS(tcpSocket, webSocket, VLessResponseHeader, retry, log);
}

function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
    let readableStreamCancel = false;
    const stream = new ReadableStream({
        start(controller) {
            webSocketServer.addEventListener('message', (event) => {
                const message = event.data;
                controller.enqueue(message);
            });

            webSocketServer.addEventListener('close', () => {
                safeCloseWebSocket(webSocketServer);
                controller.close();
            });

            webSocketServer.addEventListener('error', (err) => {
                log('webSocketServer has error');
                controller.error(err);
            });
            const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
            if (error) {
                controller.error(error);
            } else if (earlyData) {
                controller.enqueue(earlyData);
            }
        },

        pull(controller) {
        },

        cancel(reason) {
            log(`ReadableStream was canceled, due to ${reason}`);
            readableStreamCancel = true;
            safeCloseWebSocket(webSocketServer);
        }
    });

    return stream;
}

function processVLessHeader(VLessBuffer, userID) {
    if (VLessBuffer.byteLength < 24) {
        return {
            hasError: true,
            message: 'invalid data',
        };
    }

    const version = new Uint8Array(VLessBuffer.slice(0, 1));
    let isValidUser = false;
    let isUDP = false;
    const slicedBuffer = new Uint8Array(VLessBuffer.slice(1, 17));
    const slicedBufferString = stringify(slicedBuffer);

    const uuids = userID.includes(',') ? userID.split(",") : [userID];
    isValidUser = uuids.some(userUuid => slicedBufferString === userUuid.trim()) || uuids.length === 1 && slicedBufferString === uuids[0].trim();

    if (!isValidUser) {
        return {
            hasError: true,
            message: 'invalid user',
        };
    }

    const optLength = new Uint8Array(VLessBuffer.slice(17, 18))[0];
    const command = new Uint8Array(
        VLessBuffer.slice(18 + optLength, 18 + optLength + 1)
    )[0];

    if (command === 1) {
        isUDP = false;
    } else if (command === 2) {
        isUDP = true;
    } else {
        return {
            hasError: true,
            message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`,
        };
    }
    const portIndex = 18 + optLength + 1;
    const portBuffer = VLessBuffer.slice(portIndex, portIndex + 2);
    const portRemote = new DataView(portBuffer).getUint16(0);

    let addressIndex = portIndex + 2;
    const addressBuffer = new Uint8Array(
        VLessBuffer.slice(addressIndex, addressIndex + 1)
    );

    const addressType = addressBuffer[0];
    let addressLength = 0;
    let addressValueIndex = addressIndex + 1;
    let addressValue = '';
    switch (addressType) {
        case 1:
            addressLength = 4;
            addressValue = new Uint8Array(
                VLessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
            ).join('.');
            break;
        case 2:
            addressLength = new Uint8Array(
                VLessBuffer.slice(addressValueIndex, addressValueIndex + 1)
            )[0];
            addressValueIndex += 1;
            addressValue = new TextDecoder().decode(
                VLessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
            );
            break;
        case 3:
            addressLength = 16;
            const dataView = new DataView(
                VLessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
            );
            const ipv6 = [];
            for (let i = 0; i < 8; i++) {
                ipv6.push(dataView.getUint16(i * 2).toString(16));
            }
            addressValue = ipv6.join(':');
            break;
        default:
            return {
                hasError: true,
                message: `invild  addressType is ${addressType}`,
            };
    }
    if (!addressValue) {
        return {
            hasError: true,
            message: `addressValue is empty, addressType is ${addressType}`,
        };
    }

    return {
        hasError: false,
        addressRemote: addressValue,
        addressType,
        portRemote,
        rawDataIndex: addressValueIndex + addressLength,
        VLessVersion: version,
        isUDP,
    };
}

async function remoteSocketToWS(remoteSocket, webSocket, VLessResponseHeader, retry, log) {
    let remoteChunkCount = 0;
    let chunks = [];
    let VLessHeader = VLessResponseHeader;
    let hasIncomingData = false;
    await remoteSocket.readable
        .pipeTo(
            new WritableStream({
                async write(chunk, controller) {
                    hasIncomingData = true;
                    remoteChunkCount++;
                    if (webSocket.readyState !== WS_READY_STATE_OPEN) {
                        controller.error(
                            'webSocket.readyState is not open, maybe close'
                        );
                    }
                    if (VLessHeader) {
                        webSocket.send(await new Blob([VLessHeader, chunk]).arrayBuffer());
                        VLessHeader = null;
                    } else {
                        webSocket.send(chunk);
                    }
                },
                close() {
                    log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
                },
                abort(reason) {
                    console.error(`remoteConnection!.readable abort`, reason);
                },
            })
        )
        .catch((error) => {
            console.error(
                `remoteSocketToWS has exception `,
                error.stack || error
            );
            safeCloseWebSocket(webSocket);
        });

    if (hasIncomingData === false && retry) {
        log(`retry`);
        retry();
    }
}

function base64ToArrayBuffer(base64Str) {
    if (!base64Str) {
        return { earlyData: null, error: null };
    }
    try {
        base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
        const decode = atob(base64Str);
        const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
        return { earlyData: arryBuffer.buffer, error: null };
    } catch (error) {
        return { earlyData: null, error };
    }
}

function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-fA-F]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

const WS_READY_STATE_OPEN = 1;
const WS_READY_STATE_CLOSING = 2;

function safeCloseWebSocket(socket) {
    try {
        if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
            socket.close();
        }
    } catch (error) {
        console.error('safeCloseWebSocket error', error);
    }
}

const byteToHex = [];

for (let i = 0; i < 256; ++i) {
    byteToHex.push((i + 256).toString(16).slice(1));
}

function unsafeStringify(arr, offset = 0) {
    return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}

function stringify(arr, offset = 0) {
    const uuid = unsafeStringify(arr, offset);
    if (!isValidUUID(uuid)) {
        throw TypeError("Stringified UUID is invalid");
    }
    return uuid;
}

async function handleUDPOutBound(webSocket, VLessResponseHeader, log) {
    let isVLessHeaderSent = false;
    const transformStream = new TransformStream({
        transform(chunk, controller) {
            for (let index = 0; index < chunk.byteLength;) {
                const lengthBuffer = chunk.slice(index, index + 2);
                const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
                const udpData = new Uint8Array(
                    chunk.slice(index + 2, index + 2 + udpPakcetLength)
                );
                index = index + 2 + udpPakcetLength;
                controller.enqueue(udpData);
            }
        }
    });

    transformStream.readable.pipeTo(new WritableStream({
        async write(chunk) {
            const resp = await fetch(dohURL,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/dns-message',
                    },
                    body: chunk,
                });
            const dnsQueryResult = await resp.arrayBuffer();
            const udpSize = dnsQueryResult.byteLength;
            const udpSizeBuffer = new Uint8Array([(udpSize >> 8) & 0xff, udpSize & 0xff]);
            if (webSocket.readyState === WS_READY_STATE_OPEN) {
                log(`doh success and dns message length is ${udpSize}`);
                if (isVLessHeaderSent) {
                    webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                } else {
                    webSocket.send(await new Blob([VLessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
                    isVLessHeaderSent = true;
                }
            }
        }
    })).catch((error) => {
        log('dns udp has error' + error);
    });

    const writer = transformStream.writable.getWriter();

    return {
        write(chunk) {
            writer.write(chunk);
        }
    };
}

const at = 'QA==';
const pt = 'dmxlc3M=';
const ed = 'RUR0dW5uZWw=';
function getVLessConfig(userIDs, hostName) {
    const commonUrlPart = `:443?encryption=none&security=tls&sni=${hostName}&fp=randomized&type=ws&host=${hostName}&path=%2F%3Fed%3D2048#${hostName}`;
    const hashSeparator = "################################################################";
    const userIDArray = userIDs.split(",");

    const output = userIDArray.map((userID) => {
        const VLessMain = atob(pt) + '://' + userID + atob(at) + hostName + commonUrlPart;
        const VLessSec = atob(pt) + '://' + userID + atob(at) + PoxyIP + commonUrlPart;
        return `<h2>UUID: ${userID}</h2>${hashSeparator}\nv2ray default ip
---------------------------------------------------------------
${VLessMain}
<button onclick='copyToClipboard("${VLessMain}")'><i class="fa fa-clipboard"></i> Copy VLessMain</button>
---------------------------------------------------------------
v2ray with bestip
---------------------------------------------------------------
${VLessSec}
<button onclick='copyToClipboard("${VLessSec}")'><i class="fa fa-clipboard"></i> Copy VLessSec</button>
---------------------------------------------------------------`;
    }).join('\n');
    const sublink = `https://${hostName}/sub/${userIDArray[0]}?format=clash`;
    const subbestip = `https://${hostName}/bestip/${userIDArray[0]}`;
    const clash_link = `https://api.v1.mk/sub?target=clash&url=${encodeURIComponent(sublink)}&insert=false&emoji=true&list=false&tfo=false&scv=true&fdn=false&sort=false&new_name=true`;
    const header = `
<p align='center'><img src='https://cloudflare-ipfs.com/ipfs/bafybeigd6i5aavwpr6wvnwuyayklq3omonggta4x2q7kpmgafj357nkcky' alt='图片描述' style='margin-bottom: -50px;'>
<b style='font-size: 15px;'>Welcome! This function generates configuration for VLess protocol. If you found this useful, please check our GitHub project for more:</b>
<b style='font-size: 15px;'>欢迎！这是生成 VLess 协议的配置。如果您发现这个项目很好用，请查看我们的 GitHub 项目给我一个star：</b>
<a href='https://github.com/3Kmfi6HP/EDtunnel' target='_blank'>EDtunnel - https://github.com/3Kmfi6HP/EDtunnel</a>
<iframe src='https://ghbtns.com/github-btn.html?user=USERNAME&repo=REPOSITORY&type=star&count=true&size=large' frameborder='0' scrolling='0' width='170' height='30' title='GitHub'></iframe>
<a href='//${hostName}/sub/${userIDArray[0]}' target='_blank'>VLess 节点订阅连接</a>
<a href='clash://install-config?url=${encodeURIComponent(`https://${hostName}/sub/${userIDArray[0]}?format=clash`)}}' target='_blank'>Clash for Windows 节点订阅连接</a>
<a href='${clash_link}' target='_blank'>Clash 节点订阅连接</a>
<a href='${subbestip}' target='_blank'>优选IP自动节点订阅</a>
<a href='clash://install-config?url=${encodeURIComponent(subbestip)}' target='_blank'>Clash优选IP自动</a>
<a href='sing-box://import-remote-profile?url=${encodeURIComponent(subbestip)}' target='_blank'>singbox优选IP自动</a>
<a href='sn://subscription?url=${encodeURIComponent(subbestip)}' target='_blank'>nekobox优选IP自动</a>
<a href='v2rayng://install-config?url=${encodeURIComponent(subbestip)}' target='_blank'>v2rayNG优选IP自动</a></p>`;
const htmlHead = `
  <head>
    <title>EDtunnel: VLess configuration</title>
    <meta name='description' content='This is a tool for generating VLess protocol configurations. Give us a star on GitHub https://github.com/3Kmfi6HP/EDtunnel if you found it useful!'>
    <meta name='keywords' content='EDtunnel, cloudflare pages, cloudflare worker, severless'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <meta property='og:site_name' content='EDtunnel: VLess configuration' />
    <meta property='og:type' content='website' />
    <meta property='og:title' content='EDtunnel - VLess configuration and subscribe output' />
    <meta property='og:description' content='Use cloudflare pages and worker severless to implement VLess protocol' />
    <meta property='og:url' content='https://${hostName}/' />
    <meta property='og:image' content='https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`VLess://${userIDs.split(",")[0]}@${hostName}${commonUrlPart}`)}' />
    <meta name='twitter:card' content='summary_large_image' />
    <meta name='twitter:title' content='EDtunnel - VLess configuration and subscribe output' />
    <meta name='twitter:description' content='Use cloudflare pages and worker severless to implement VLess protocol' />
    <meta name='twitter:url' content='https://${hostName}/' />
    <meta name='twitter:image' content='https://cloudflare-ipfs.com/ipfs/bafybeigd6i5aavwpr6wvnwuyayklq3omonggta4x2q7kpmgafj357nkcky' />
    <meta property='og:image:width' content='1500' />
    <meta property='og:image:height' content='1500' />
    <style>
    body {
      font-family: Arial, sans-serif;
      background-color: #f0f0f0;
      color: #333;
      padding: 10px;
    }
    a {
      color: #1a0dab;
      text-decoration: none;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      background-color: #fff;
      border: 1px solid #ddd;
      padding: 15px;
      margin: 10px 0;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #333;
        color: #f0f0f0;
      }
      a {
        color: #9db4ff;
      }
      pre {
        background-color: #282a36;
        border-color: #6272a4;
      }
    }
    </style>
    <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'>
  </head>
  <body>
    <pre style='background-color: transparent; border: none;'>${header}</pre>
    <pre>${output}</pre>
  </body>
  <script>
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text)
        .then(() => {
          alert("Copied to clipboard");
        })
        .catch((err) => {
          console.error("Failed to copy to clipboard:", err);
        });
    }
  </script>
</html>`;
}

const SetPortHttp = new Set([80, 8080, 8880, 2052, 2086, 2095, 2082]);
const SetPortHttps = new Set([443, 8443, 2053, 2096, 2087, 2083]);

function BuildVLessSub(userID_Path, Hostname) {
    const userIDArray = userID_Path.includes(',') ? userID_Path.split(',') : [userID_Path];
    const PartUrlGeneralHttp = `?encryption=none&security=none&fp=random&type=ws&host=${Hostname}&path=%2F%3Fed%3D2048#`;
    const PartUrlGeneralHttps = `?encryption=none&security=tls&sni=${Hostname}&fp=random&type=ws&host=${Hostname}&path=%2F%3Fed%3D2048#`;

    const Result์ = userIDArray.flatMap((userID) => {
        const ConfigurationHttp = Array.from(SetPortHttp).flatMap((Port) => {
            if (!Hostname.includes('pages.dev')) {
                const PartUrl = `${Hostname}-HTTP-${Port}`;
                const VLessMainHttp = atob(pt) + '://' + userID + atob(at) + Hostname + ':' + Port + PartUrlGeneralHttp + PartUrl;
                return PoxyIPs.flatMap((PoxyIP) => {
                    const VLessSecondaryHttp = atob(pt) + '://' + userID + atob(at) + PoxyIP + ':' + Port + PartUrlGeneralHttp + PartUrl + '-' + PoxyIP + '-' + atob(ed);
                    return [VLessMainHttp, VLessSecondaryHttp];
                });
            }
            return [];
        });
        
const ConfigurationHttps = Array.from(SetPortHttps).flatMap((Port) => {
            const PartUrl = `${Hostname}-HTTPS-${Port}`;
            const VLessMainHttps = atob(pt) + '://' + userID + atob(at) + Hostname + ':' + Port + PartUrlGeneralHttps + PartUrl;
            return PoxyIPs.flatMap((PoxyIP) => {
                const VLessSecondaryHttps = atob(pt) + '://' + userID + atob(at) + PoxyIP + ':' + Port + PartUrlGeneralHttps + PartUrl + '-' + PoxyIP + '-' + atob(ed);
                return [VLessMainHttps, VLessSecondaryHttps];
            });
        });

        return [...ConfigurationHttp, ...ConfigurationHttps];
    });

    return Result์.join('\n');
}

const cn_hostnames = [
    'www.kuaidi100.com'
];   

 // تابع اصلی
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request, event.SamSoft));
});    
