# Changes Log - Inhabit WebSocket Integration

## 2026-11-23

### New Files Created
- `UNREAL_INTEGRATION_GUIDE.md` - Complete Unreal Engine WebSocket protocol documentation
- `IMPLEMENTATION_SUMMARY.md` - High-level summary of all changes

### Modified Files

#### 1. `apps/api/src/server.ts`
- Added `ws` WebSocket library import and server instantiation
- Created `unrealClients` Set to track connected Unreal applications
- WebSocket event handlers: connection, message, close, error
- Added `POST /api/forward-command` endpoint for forwarding validated commands to Unreal
- Updated `/health` endpoint to report `unrealConnected` status
- Exposed shared state via `app.set()` for route access: `unrealClients`, `wss`, `forwardExecutionResultToWebsite`

#### 2. `apps/api/src/routes/commandRoutes.ts`
- Updated `/health` route to include `unrealConnected` from app state
- Added `POST /forward-command` route that:
  - Retrieves connected clients from `req.app.get('unrealClients')`
  - Constructs `{type: "execute_command", command_id, payload}` message
  - Sends to all open WebSocket connections
  - Returns `success: true` with `forwardedTo` count, or 503 if no clients connected

#### 3. `apps/web/src/services/unrealService.ts` (complete rewrite)
- Created `UnrealService` class managing WebSocket connection to backend
- Connects to `ws://localhost:3001/ws`
- Command queue for handling connection race conditions
- `queueCommand(command)` method: adds command to queue, sends if connected
- `setOnExecutionResult(callback)`: registers callback for execution result updates
- `isConnectedToUnreal()`: checks connection status
- `disconnect()`: cleanly closes WebSocket
- Incoming message handling: `execution_result` and `acknowledgement` types

#### 4. `apps/web/src/components/voice/VoicePanel.tsx`
- Added `executionStatus` state machine: `pending` | `executing` | `success` | `failure` | `disconnected`
- Added `lastCommandId` state for matching execution results to commands
- Updated `interpretCommand()`:
  - On `status: "ready"`: generates unique command ID, queues to Unreal, sets status to `executing`
  - On `status: "clarification_required"`: sets status to `pending`, does NOT send to Unreal
  - On `status: "unsupported"`: sets status to `pending`, does NOT send to Unreal
- Added `React.useEffect` to listen for execution results from Unreal via `unrealService.setOnExecutionResult()`
- Added connection status polling (updates UI every second)
- Added visual execution status display with color coding:
  - Green: success
  - Red: failure  
  - Orange: executing
  - Gray: disconnected
- Preserved all existing UI: speech recognition, transcript display, command interpretation, status messages

## WebSocket Message Protocol

### Backend → Unreal: `execute_command`
```json
{
  "type": "execute_command",
  "command_id": "unique-id",
  "payload": {
    "status": "ready",
    "action": "move_object",
    "object": {"name": "sofa", "id": null},
    "parameters": {"direction": "left", "distance": 50, "unit": "cm"},
    "clarification": null,
    "original_transcript": "Move the sofa 50 centimetres to the left."
  }
}
```

### Unreal → Backend: `acknowledgement`
```json
{
  "type": "acknowledgement",
  "command_id": "unique-id",
  "status": "success",
  "message": "Command executed successfully"
}
```

### Unreal → Backend: `execution_result`
```json
{
  "type": "execution_result",
  "command_id": "unique-id",
  "status": "success",
  "message": "Sofa moved successfully."
}
```

### Backend API Endpoints
- `GET /health` → `{status, groqModel, unrealConnected}`
- `POST /api/forward-command` → `{success, forwardedTo}` or `{success: false, error}`

## Test Commands Verification

| Spoken Command | Expected AI Status | Sent to Unreal? |
|---|---|---|
| "Move the sofa 50 centimetres to the left." | `ready` | Yes |
| "Rotate the dining table by 90 degrees." | `ready` | Yes |
| "Change the wall colour to beige." | `ready` | Yes |
| "Make the sofa bigger." | `ready` | Yes |
| "Move the chair next to the window." | `ready` or `clarification_required` | Conditional |
| "Delete the selected object." | `ready` | Yes |
| "Move it slightly." | `clarification_required` | No |
| "Make the room look more modern." | `unsupported` | No |

## How to Run

### Backend
```bash
cd inhabit/apps/api
npm install          # install ws dependency
npm run dev          # starts on http://localhost:3001
```

### Frontend
```bash
cd inhabit/apps/web
npm run dev          # starts Vite on http://localhost:5173 (default)
```

### Unreal Engine (external)
1. Implement WebSocket client connecting to `ws://localhost:3001/ws`
2. Send registration: `{"type": "register", "client_name": "Inhabit-Unreal-App"}`
3. Handle `execute_command` messages
4. Process commands, send `acknowledgement` back
5. Send `execution_result` with status and message

## Known Limitations
1. `ws` package must be installed in API workspace
2. Frontend WebSocket polling every second (could be optimized with shared state)
3. Execution result from backend to frontend is logged; frontend polls connection status
4. No Unreal Engine project files in this repo - integration is external
5. Groq API key must be set in `.env` (already configured)