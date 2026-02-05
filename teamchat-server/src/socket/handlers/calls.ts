import { SOCKET_EVENTS } from '@teamchat/shared';
import { ensureCallParticipant } from '../access.js';
import { callRoom, userRoom } from '../rooms.js';
import type { SocketContext } from '../types.js';
import type { CallAnswerInput, CallOfferInput, IceCandidateInput } from '@teamchat/shared';

export function registerCallHandlers(ctx: SocketContext): void {
  const { io, socket, userId, displayName } = ctx;

  socket.on(SOCKET_EVENTS.CALL_INVITE, async (data: { callId: string; toUserIds: string[] }) => {
    const { callId, toUserIds } = data;

    const hasAccess = await ensureCallParticipant(userId, callId, socket);
    if (!hasAccess) return;

    for (const toUserId of toUserIds) {
      io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.CALL_RINGING, {
        callId,
        fromUserId: userId,
        fromDisplayName: displayName,
      });
    }
  });

  socket.on(SOCKET_EVENTS.CALL_ACCEPTED, async (data: { callId: string }) => {
    const hasAccess = await ensureCallParticipant(userId, data.callId, socket);
    if (!hasAccess) return;

    socket.join(callRoom(data.callId));

    socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, {
      userId,
      displayName,
    });
  });

  socket.on(SOCKET_EVENTS.CALL_DECLINED, async (data: { callId: string; toUserId: string }) => {
    const hasAccess = await ensureCallParticipant(userId, data.callId, socket);
    if (!hasAccess) return;

    io.to(userRoom(data.toUserId)).emit(SOCKET_EVENTS.CALL_DECLINED, {
      callId: data.callId,
      fromUserId: userId,
    });
  });

  socket.on(SOCKET_EVENTS.CALL_JOIN, async (data: { callId: string }) => {
    const hasAccess = await ensureCallParticipant(userId, data.callId, socket);
    if (!hasAccess) return;

    socket.join(callRoom(data.callId));

    socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, {
      userId,
      displayName,
    });
  });

  socket.on(SOCKET_EVENTS.CALL_LEAVE, async (data: { callId: string }) => {
    const hasAccess = await ensureCallParticipant(userId, data.callId, socket);
    if (!hasAccess) return;

    socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, {
      userId,
    });

    socket.leave(callRoom(data.callId));
  });

  socket.on(SOCKET_EVENTS.CALL_OFFER, (data: CallOfferInput) => {
    const { callId, toUserId, sdp } = data;
    ensureCallParticipant(userId, callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;

        if (toUserId) {
          io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.CALL_OFFER, {
            callId,
            fromUserId: userId,
            sdp,
          });
        } else {
          socket.to(callRoom(callId)).emit(SOCKET_EVENTS.CALL_OFFER, {
            callId,
            fromUserId: userId,
            sdp,
          });
        }
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });

  socket.on(SOCKET_EVENTS.CALL_ANSWER, (data: CallAnswerInput) => {
    const { callId, toUserId, sdp } = data;

    ensureCallParticipant(userId, callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;
        io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.CALL_ANSWER, {
          callId,
          fromUserId: userId,
          sdp,
        });
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });

  socket.on(SOCKET_EVENTS.CALL_ICE, (data: IceCandidateInput) => {
    const { callId, toUserId, candidate } = data;

    ensureCallParticipant(userId, callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;
        io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.CALL_ICE, {
          callId,
          fromUserId: userId,
          candidate,
        });
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });

  socket.on(SOCKET_EVENTS.CALL_HANGUP, (data: { callId: string }) => {
    ensureCallParticipant(userId, data.callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;
        socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_HANGUP, {
          userId,
        });

        socket.leave(callRoom(data.callId));
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });

  socket.on(
    SOCKET_EVENTS.CALL_MEDIA_STATE,
    (data: { callId: string; audioEnabled: boolean; videoEnabled: boolean; screenShareEnabled: boolean }) => {
      ensureCallParticipant(userId, data.callId, socket)
        .then((hasAccess) => {
          if (!hasAccess) return;
          socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_MEDIA_STATE, {
            userId,
            ...data,
          });
        })
        .catch(() => {
          // Ignore errors - ensureCallParticipant handles emitting errors
        });
    }
  );

  socket.on(SOCKET_EVENTS.CALL_SCREENSHARE_START, (data: { callId: string }) => {
    ensureCallParticipant(userId, data.callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;
        socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_SCREENSHARE_START, {
          userId,
        });
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });

  socket.on(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, (data: { callId: string }) => {
    ensureCallParticipant(userId, data.callId, socket)
      .then((hasAccess) => {
        if (!hasAccess) return;
        socket.to(callRoom(data.callId)).emit(SOCKET_EVENTS.CALL_SCREENSHARE_STOP, {
          userId,
        });
      })
      .catch(() => {
        // Ignore errors - ensureCallParticipant handles emitting errors
      });
  });
}
