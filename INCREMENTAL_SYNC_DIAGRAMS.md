# Incremental Sync Flow Diagrams

## 1. Application Startup Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER / REACT APP                         │
└─────────────────────────────────────────────────────────────────┘

Time: T=0 (App loads)
┌─────────────────────────────────────────────────────────────────┐
│  App.tsx useEffect → dispatch(fetchDevices())                   │
│                                                                  │
│  "Fetch COMPLETE device list from database"                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   API Request          │
        │  GET /devices          │
        │  (Full list)           │
        │  Size: 1-2 MB          │
        └────────┬───────────────┘
                 │
                 ▼ (Response: 2-5 seconds)
        ┌────────────────────────┐
        │  Redux: fetchDevices   │
        │  .fulfilled            │
        │                        │
        │  state.items = [...]   │
        │  (all 100+ devices)    │
        │                        │
        │  lastSyncTimestamp =   │
        │  "2025-12-10T15:05Z"   │
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │   UI Renders All       │
        │   Devices in List      │
        │   (Fully Populated)    │
        └────────┬───────────────┘
                 │
         Time: T=30s
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  useIncrementalSync hook:                                       │
│  dispatch(fetchDeviceChanges(lastSyncTimestamp))                │
│                                                                  │
│  "Fetch ONLY changed devices since last sync"                  │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   API Request              │
        │  GET /devices/changes/     │
        │      since/2025-12-10T15Z  │
        │  Size: 20-100 KB           │
        │  (Much smaller!)           │
        └────────┬───────────────────┘
                 │
                 ▼ (Response: <1 second)
        ┌────────────────────────────┐
        │  Redux: fetchDeviceChanges │
        │  .fulfilled                │
        │                            │
        │  Merge changed devices:    │
        │  - Update existing         │
        │  - Add new ones            │
        │                            │
        │  lastSyncTimestamp =       │
        │  "2025-12-10T15:05:30Z"    │
        └────────┬───────────────────┘
                 │
                 ▼
        ┌────────────────────────────┐
        │   UI Re-renders ONLY       │
        │   Changed Devices          │
        │   (Smooth update)          │
        └────────┬───────────────────┘
                 │
         Time: T=60s (Loop repeats every 30s)
         ▼ ...polling continues...
```

---

## 2. Data Flow Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        BACKEND                                 │
│                  (FastAPI + Database)                          │
└────────────────────────────────────────────────────────────────┘

Endpoints:
┌──────────────────────────────────┐  ┌─────────────────────────┐
│   GET /devices                   │  │ GET /devices/changes/   │
│   (Full list)                    │  │ since/{timestamp}       │
│                                  │  │ (Changes only)          │
│ Queries:                         │  │                         │
│ SELECT * FROM devices            │  │ Queries:                │
│ ORDER BY id                      │  │ SELECT * FROM devices   │
│                                  │  │ WHERE last_seen >=      │
│ Returns:                         │  │ {timestamp}             │
│ [device1, device2, ..., device100]  │ ORDER BY id             │
│ ~1-2 MB                          │  │                         │
│                                  │  │ Returns:                │
│                                  │  │ [device5, device12]     │
│                                  │  │ (only changed)          │
│                                  │  │ ~20-100 KB              │
│                                  │  │                         │
│                                  │  │ + Timestamp for next    │
│                                  │  │   sync request          │
└────────────────────────────────────┴─────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                │
│                   (React + Redux)                              │
└────────────────────────────────────────────────────────────────┘

Redux State:
┌─────────────────────────────────────────────┐
│ devices: {                                  │
│   items: [                                  │
│     { id: 1, hostname: 'router1', ... },   │
│     { id: 2, hostname: 'switch1', ... },   │
│     ...                                     │
│   ],                                        │
│   lastSyncTimestamp: "2025-12-10T15:05Z",  │
│   loading: false,                           │
│   error: null                               │
│ }                                           │
└─────────────────────────────────────────────┘
         ▲                          │
         │                          │ (Initial: fetchDevices)
         │                   ┌──────▼──────────────┐
         │                   │  Fetch all devices  │
         │                   │  Size: 1-2 MB       │
         │                   └────────┬────────────┘
         │                            │
         │         ┌──────────────────┘
         │         │
         │         ▼
         │  ┌──────────────────────────┐
         │  │ Merge data into Redux    │
         │  │ state.items = newData    │
         │  └──────┬───────────────────┘
         │         │
         │         ▼
         │  ┌──────────────────────────┐
         │  │ React re-renders UI      │
         │  │ All devices visible      │
         │  └──────┬───────────────────┘
         │         │
  Every 30s│    (After 30 seconds)
         │  ┌──────────────────────────┐
         │  │ Fetch changes since      │
         │  │ lastSyncTimestamp        │
         │  │ Size: 20-100 KB          │
         └──┤                          │
            │ API call                 │
            │ GET /devices/changes/... │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │ Response: { changed: ... │
            │ timestamp: "..." }       │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │ Merge changes only:      │
            │ - Find existing by ID    │
            │ - Update or add          │
            │ - Update lastSyncTime    │
            └──────┬───────────────────┘
                   │
                   ▼
            ┌──────────────────────────┐
            │ React re-renders changed │
            │ devices only             │
            │ (Efficient update)       │
            └──────────────────────────┘
                   │
              Loop repeats every 30s...
```

---

## 3. Device Change Detection Logic

```
┌─────────────────────────────────────────────────────────────┐
│  Backend: Get Device Changes Since Timestamp                │
└─────────────────────────────────────────────────────────────┘

Client request:
  GET /devices/changes/since/2025-12-10T15:05:00Z
                                     ▲
                                     │
                                (Last sync time)

Backend processing:
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  FOR EACH device IN database:                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  IF device.last_seen >= 2025-12-10T15:05:00Z:        │ │
│  │      (Device was modified after last sync)           │ │
│  │      → Include in response                           │ │
│  │                                                      │ │
│  │  ELSE IF device.status != 'unknown':                 │ │
│  │      (Device status changed)                         │ │
│  │      → Include in response                           │ │
│  │                                                      │ │
│  │  ELSE:                                               │ │
│  │      (No change detected)                            │ │
│  │      → Skip this device                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  Return: [changed_device_1, changed_device_2, ...]        │
│  + Current server timestamp for next sync                 │
│                                                            │
└────────────────────────────────────────────────────────────┘

Example:
  Input timestamp: 2025-12-10T15:00:00Z
  
  Database contains:
  ┌────────────────┬──────────────────────┐
  │ Device ID      │ last_seen            │
  ├────────────────┼──────────────────────┤
  │ 1 (router1)    │ 2025-12-10T14:55:00Z │ ✗ (too old)
  │ 2 (switch1)    │ 2025-12-10T15:03:00Z │ ✓ (within window)
  │ 3 (router2)    │ 2025-12-10T15:02:30Z │ ✓ (within window)
  │ 4 (firewall)   │ 2025-12-10T14:45:00Z │ ✗ (too old)
  │ 5 (switch2)    │ 2025-12-10T15:04:45Z │ ✓ (within window)
  └────────────────┴──────────────────────┘
  
  Response: [device_2, device_3, device_5]
  Timestamp: 2025-12-10T15:05:30Z (current time)
```

---

## 4. Redux State Merge Logic

```
Current State Before Change Request:
┌────────────────────────────────────────────┐
│ items: [                                   │
│   { id: 1, hostname: "router1", status: "online", ... },
│   { id: 2, hostname: "switch1", status: "offline", ... },
│   { id: 3, hostname: "router2", status: "online", ... }
│ ]                                          │
└────────────────────────────────────────────┘

API Response (Changes):
┌────────────────────────────────────────────┐
│ changed: [                                 │
│   { id: 2, hostname: "switch1", status: "online", ... },
│       ↑ Status changed from offline to online
│   { id: 4, hostname: "firewall", status: "online", ... }
│       ↑ New device (not in state.items)
│ ]                                          │
└────────────────────────────────────────────┘

Merge Process:
┌──────────────────────────────────────────────┐
│ FOR EACH changed device:                     │
│                                              │
│ Device ID: 2                                 │
│ ├─ Find in state.items by ID → Found (index 1)
│ └─ Update: items[1] = { ...items[1],         │
│                         ...changed_device }  │
│                                              │
│ Device ID: 4                                 │
│ ├─ Find in state.items by ID → Not found    │
│ └─ Add to items: items.push(changed_device)  │
│                                              │
└──────────────────────────────────────────────┘

Final State After Merge:
┌────────────────────────────────────────────┐
│ items: [                                   │
│   { id: 1, hostname: "router1", status: "online", ... },
│   { id: 2, hostname: "switch1", status: "online", ... },  ← UPDATED
│   { id: 3, hostname: "router2", status: "online", ... }
│   { id: 4, hostname: "firewall", status: "online", ... }  ← ADDED
│ ]                                          │
│                                            │
│ lastSyncTimestamp: "2025-12-10T15:05:30Z"  │
└────────────────────────────────────────────┘
```

---

## 5. Bandwidth Comparison

```
SCENARIO: 100 devices, polling for 10 minutes (changes every minute)

BEFORE (Full Fetch Every 60 Seconds):
┌──────────────────────────────────┐
│  0:00   Full fetch:    2000 KB   │
│  1:00   Full fetch:    2000 KB   │
│  2:00   Full fetch:    2000 KB   │
│  3:00   Full fetch:    2000 KB   │
│  4:00   Full fetch:    2000 KB   │
│  5:00   Full fetch:    2000 KB   │
│  6:00   Full fetch:    2000 KB   │
│  7:00   Full fetch:    2000 KB   │
│  8:00   Full fetch:    2000 KB   │
│  9:00   Full fetch:    2000 KB   │
│  ───────────────────────────────│
│  TOTAL:               20,000 KB  │
└──────────────────────────────────┘

AFTER (Full Load + Incremental Every 30 Seconds):
┌──────────────────────────────────┐
│  0:00   Full fetch:     2000 KB  │
│  0:30   Changes:           45 KB  │
│  1:00   Changes:           38 KB  │
│  1:30   Changes:           52 KB  │
│  2:00   Changes:           41 KB  │
│  2:30   Changes:           47 KB  │
│  3:00   Changes:           39 KB  │
│  3:30   Changes:           50 KB  │
│  4:00   Changes:           44 KB  │
│  4:30   Changes:           48 KB  │
│  ...continues...                  │
│  ───────────────────────────────│
│  TOTAL:              ~2,000 KB   │
│                    (18 changes)   │
│                                   │
│  SAVINGS: 90% reduction!         │
└──────────────────────────────────┘
```

---

## 6. Error Recovery Flow

```
┌─────────────────────────────────────────────────────────┐
│ Polling Request Fails (Network Error, etc.)             │
└──────────────┬──────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ fetchDeviceChanges.rejected │
    │                             │
    │ Log error to console        │
    │ (NO error message to user)  │
    └──────────┬──────────────────┘
               │
               ▼
    ┌─────────────────────────────┐
    │ Continue normal polling     │
    │ (Try again in 30 seconds)   │
    │                             │
    │ lastSyncTimestamp remains   │
    │ unchanged                   │
    └──────────┬──────────────────┘
               │
        After 30 seconds
        (Next poll attempt)
               ▼
    ┌─────────────────────────────┐
    │ Is network back?            │
    │                             │
    │ YES → Fetch with same       │
    │       timestamp (catches up)│
    │                             │
    │ NO  → Retry in 30 seconds   │
    └─────────────────────────────┘

Result: User never sees errors, UI keeps working
        with last known good data, automatically
        syncs when network is restored.
```

---

## Summary Flows

```
Application Lifecycle:

STARTUP
  ↓
  • dispatch(fetchDevices()) → Full list loaded
  • state.lastSyncTimestamp = now
  • UI renders all devices
  ↓
POLLING (repeats every 30s)
  ↓
  • dispatch(fetchDeviceChanges(lastSyncTimestamp))
  • API returns only changes
  • State merges changes into items
  • state.lastSyncTimestamp = server timestamp
  • UI updates with merged data
  ↓
  (Repeat forever or until app closes)
```
