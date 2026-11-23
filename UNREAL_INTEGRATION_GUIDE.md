# Unreal Engine Integration Guide

This document describes the WebSocket message protocol for communication between the Inhabit backend and a separate Unreal Engine application.

## WebSocket Connection URL

```
ws://localhost:3001/ws
```

The Unreal Engine application should connect to this URL as a WebSocket client. The backend (running on port 3001) accepts the connection.

## Connection and Registration

Upon establishing the WebSocket connection, the Unreal Engine application should:

1. **Send a registration message** to identify itself:

```json
{
  "type": "register",
  "client_name": "Inhabit-Unreal-App",
  "version": "1.0.0"
}
```

2. **Wait for acknowledgement** from the backend:

```json
{
  "type": "acknowledgement",
  "status": "accepted",
  "client_id": "unique-client-id",
  "message": "Unreal Engine connected successfully"
}
```

## Incoming Command Format

When a voice command is interpreted and ready to execute, the backend sends the following message type:

```json
{
  "type": "execute_command",
  "command_id": "unique-command-id-12345",
  "payload": {
    "status": "ready",
    "action": "move_object",
    "object": {
      "name": "sofa",
      "id": null
    },
    "parameters": {
      "direction": "left",
      "distance": 50,
      "unit": "cm"
    },
    "clarification": null,
    "original_transcript": "Move the sofa 50 centimetres to the left."
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Message type (`execute_command`) |
| `command_id` | string | Unique identifier for tracking this command |
| `payload.status` | string | Command status (`ready`, `clarification_required`, `unsupported`) |
| `payload.action` | string | Action to execute (`move_object`, `rotate_object`, `scale_object`, `change_color`, `change_material`, `delete_object`, `select_object`) |
| `payload.object.name` | string | Name of the target object (can be null) |
| `payload.object.id` | string | ID of the target object (can be null if unknown) |
| `payload.parameters` | object | Action-specific parameters |
| `payload.clarification` | string | Clarification message if `status` is `clarification_required` |
| `payload.original_transcript` | string | The original user transcript |

### Action-Specific Parameters

- **move_object**: `direction` (string), `distance` (number), `unit` (string - "cm", "m", "inches", "feet")
- **rotate_object**: `angle` (number), `unit` (string - "degrees", "radians"), `axis` (string - "x", "y", "z")
- **scale_object**: `scale_factor` (number), `axis` (string - "x", "y", "z")
- **change_color**: `color_name` (string), `hex` (string - e.g., "#FF0000")
- **change_material**: `material_name` (string)
- **delete_object**: (no additional parameters)
- **select_object**: (no additional parameters)

## Acknowledgement Format

After receiving an `execute_command` message, the Unreal Engine application should process the command and send an acknowledgement:

```json
{
  "type": "acknowledgement",
  "command_id": "unique-command-id-12345",
  "status": "success",
  "message": "Command executed successfully"
}
```

Or for failure:

```json
{
  "type": "acknowledgement",
  "command_id": "unique-command-id-12345",
  "status": "failure",
  "message": "Failed to execute command"
}
```

## Execution Result Format

After processing the command, the Unreal Engine application sends the execution result back to the backend:

```json
{
  "type": "execution_result",
  "command_id": "unique-command-id-12345",
  "status": "success",
  "message": "Sofa moved successfully."
}
```

Or for failure:

```json
{
  "type": "execution_result",
  "command_id": "unique-command-id-12345",
  "status": "failure",
  "message": "Object not found or cannot be moved"
}
```

## Reconnection Behavior

1. **If the WebSocket connection is lost** during command execution:
   - The backend will retain the command in its internal queue for a limited time
   - Upon reconnection, the Unreal Engine application should re-send its registration message
   - Any pending commands will be re-forwarded to the Unreal client

2. **Reconnection procedure**:
   - Establish a new WebSocket connection to `ws://localhost:3001/ws`
   - Send the registration message immediately after connection opens
   - The backend will resend any pending commands that were not yet acknowledged
   - Commands that were already acknowledged will not be re-sent

3. **Heartbeat** (optional but recommended):
   - The Unreal Engine application should send a ping message every 30 seconds
   - The backend responds with a pong message
   - If no communication is received for 60 seconds, consider the connection disconnected

## Backend API Endpoints

### Forward Command (POST)

The website frontend uses this endpoint to forward interpreted commands to the Unreal backend:

```
POST http://localhost:3001/api/forward-command
```

Body:
```json
{
  "command_id": "unique-command-id",
  "payload": {
    "status": "ready",
    "action": "move_object",
    "object": {
      "name": "sofa",
      "id": null
    },
    "parameters": {
      "direction": "left",
      "distance": 50,
      "unit": "cm"
    },
    "clarification": null,
    "original_transcript": "Move the sofa 50 centimetres to the left."
  }
}

```

Response:
```json
{
  "success": true,
  "forwardedTo": 1
}
```

Or if no Unreal client is connected:
```json
{
  "success": false,
  "error": "No Unreal Engine client connected"
}
```

### Health Check (GET)

```
GET http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "groqModel": "meta-llama/llama-3.1-8b-instruct",
  "unrealConnected": true
}
```

## Implementation Notes

1. **Message Protocol is JSON-based**: All messages use JSON encoding.

2. **Single Command at a Time**: The backend forwards one command at a time to the Unreal client. The Unreal client should acknowledge each command before the next one is sent.

3. **Command ID Tracking**: Use the `command_id` field to track which commands have been acknowledged and which execution results have been sent.

4. **Error Handling**: If the Unreal client cannot execute a command (object not found, etc.), send an `acknowledgement` with `status: "failure"` and an appropriate `message`.

5. **Do not claim execution merely because a command was transmitted**: The backend tracks the actual execution result returned from Unreal, not just the transmission.

6. **The backend does NOT embed Unreal Engine functionality**: The Unreal application is independent and implements its own WebSocket client that connects to the documented protocol.

7. **All API keys (GROQ_API_KEY) stay on the backend**: The frontend never sees or handles Groq API keys.