import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "ws://localhost:7880";
const API_KEY     = process.env.LIVEKIT_API_KEY ?? "devkey";
const API_SECRET  = process.env.LIVEKIT_API_SECRET ?? "devsecret";

// HTTP URL для RoomServiceClient (ws: → http:)
const LIVEKIT_HTTP_URL = LIVEKIT_URL.replace(/^ws/, "http");

export function getRoomService() {
  return new RoomServiceClient(LIVEKIT_HTTP_URL, API_KEY, API_SECRET);
}

export async function generateToken(options: {
  roomName: string;
  participantName: string;
  participantId: string;
  canPublish: boolean;
  canSubscribe: boolean;
  metadata?: string;
}): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: options.participantId,
    name: options.participantName,
    ttl: "4h",
    metadata: options.metadata,
  });

  at.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: options.canPublish,
    canSubscribe: options.canSubscribe,
    canPublishData: true,
    roomRecord: true, // allow egress
  });

  return at.toJwt();
}

export function makeRoomName(bookingId: string): string {
  return `session-${bookingId}`;
}
