import { createFileRoute } from "@tanstack/react-router"
import { Button, Card, Input, Space, Tag, Toast } from "antd-mobile"
import { type DataConnection, Peer } from "peerjs"
import { toDataURL } from "qrcode"
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"

type Role = "host" | "guest"
type ConnectionState = "idle" | "signaling" | "waiting" | "connecting" | "connected" | "closed"
type MazeDifficulty = "compact" | "standard" | "expert"
type RoundPhase = "playing" | "complete"

type GameState = {
  level: number
  seed: number
  difficulty: MazeDifficulty
  width: number
  height: number
  cells: string[]
  playerX: number
  playerY: number
  exitX: number
  exitY: number
}

type NetworkMessage =
  | { type: "input"; axis: number }
  | { type: "snapshot"; game: GameState }
  | { type: "difficulty"; difficulty: MazeDifficulty }
  | { type: "round-complete"; level: number }
  | { type: "hello" }
type JoystickVector = { x: number; y: number }
type ConnectionBadge = ReturnType<typeof getConnectionBadge>

const CELL_WALL = "#"
const CELL_OPEN = "."
const PLAYER_SPEED = 3.8
const PLAYER_RADIUS = 0.28
const BROADCAST_INTERVAL = 70
const DIFFICULTIES: Array<{
  id: MazeDifficulty
  label: string
  detail: string
  baseSize: number
  maxSize: number
}> = [
  { id: "compact", label: "Compact", detail: "15 x 15", baseSize: 15, maxSize: 21 },
  { id: "standard", label: "Standard", detail: "21 x 21", baseSize: 21, maxSize: 27 },
  { id: "expert", label: "Expert", detail: "27 x 27", baseSize: 27, maxSize: 31 },
]

export const Route = createFileRoute("/demos/peer-maze")({
  component: PeerMazeDemo,
})

function PeerMazeDemo() {
  const initialJoinIdRef = useRef(new URLSearchParams(window.location.search).get("join") ?? "")
  const peerRef = useRef<Peer | null>(null)
  const connectionRef = useRef<DataConnection | null>(null)
  const gameRef = useRef<GameState | null>(null)
  const roleRef = useRef<Role | null>(null)
  const roundPhaseRef = useRef<RoundPhase>("playing")
  const localAxisRef = useRef(0)
  const remoteAxisRef = useRef(0)
  const hasAutoJoinedRef = useRef(false)

  const [role, setRole] = useState<Role | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle")
  const [peerId, setPeerId] = useState("")
  const [joinId, setJoinId] = useState(initialJoinIdRef.current)
  const [inviteUrl, setInviteUrl] = useState("")
  const [qrSrc, setQrSrc] = useState("")
  const [statusText, setStatusText] = useState("Create a room or open an invite link.")
  const [localAxis, setLocalAxis] = useState(0)
  const [remoteAxis, setRemoteAxis] = useState(0)
  const [game, setGame] = useState<GameState | null>(null)
  const [difficulty, setDifficulty] = useState<MazeDifficulty>("standard")
  const [roundPhase, setRoundPhase] = useState<RoundPhase>("playing")

  const isSecureContext = window.isSecureContext
  const connectionBadge = getConnectionBadge(connectionState)
  const canHost = connectionState === "idle" || connectionState === "closed"
  const canJoin = canHost && joinId.trim().length > 0
  const isGamePhase = connectionState === "connected" && game !== null

  useEffect(() => {
    roleRef.current = role
  }, [role])

  useEffect(() => {
    gameRef.current = game
  }, [game])

  useEffect(() => {
    roundPhaseRef.current = roundPhase
  }, [roundPhase])

  useEffect(() => {
    if (!inviteUrl) {
      setQrSrc("")
      return
    }

    let cancelled = false

    toDataURL(inviteUrl, {
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
    }).then((source) => {
      if (!cancelled) {
        setQrSrc(source)
      }
    })

    return () => {
      cancelled = true
    }
  }, [inviteUrl])

  const resetSession = useCallback(() => {
    connectionRef.current?.close()
    peerRef.current?.destroy()
    connectionRef.current = null
    peerRef.current = null
    gameRef.current = null
    remoteAxisRef.current = 0
    localAxisRef.current = 0
    roleRef.current = null
    roundPhaseRef.current = "playing"
    setRole(null)
    setConnectionState("closed")
    setPeerId("")
    setInviteUrl("")
    setQrSrc("")
    setGame(null)
    setLocalAxis(0)
    setRemoteAxis(0)
    setRoundPhase("playing")
    setStatusText("Session closed. Create or join another room.")
  }, [])

  const sendMessage = useCallback((message: NetworkMessage) => {
    const connection = connectionRef.current

    if (connection?.open) {
      connection.send(message)
    }
  }, [])

  const handleRemoteMessage = useCallback((message: unknown) => {
    if (!isNetworkMessage(message)) {
      return
    }

    if (message.type === "input") {
      remoteAxisRef.current = clampAxis(message.axis)
      setRemoteAxis(remoteAxisRef.current)
      return
    }

    if (message.type === "difficulty") {
      setDifficulty(message.difficulty)
      setStatusText(`Next maze: ${getDifficultyOption(message.difficulty).label}.`)
      return
    }

    if (message.type === "round-complete") {
      roundPhaseRef.current = "complete"
      localAxisRef.current = 0
      remoteAxisRef.current = 0
      setLocalAxis(0)
      setRemoteAxis(0)
      setRoundPhase("complete")
      setStatusText(`Level ${message.level} cleared. Waiting for the host.`)
      return
    }

    if (message.type === "snapshot") {
      gameRef.current = message.game
      roundPhaseRef.current = "playing"
      setGame(message.game)
      setDifficulty(message.game.difficulty)
      setLocalAxis(0)
      setRemoteAxis(0)
      setRoundPhase("playing")
      setStatusText(`Connected. Level ${message.game.level} is live.`)
    }
  }, [])

  const bindConnection = useCallback(
    (connection: DataConnection, nextRole: Role) => {
      connectionRef.current?.close()
      connectionRef.current = connection

      connection.on("open", () => {
        setConnectionState("connected")
        setStatusText(nextRole === "host" ? "Partner connected. Level is live." : "Connected.")
        sendMessage({ type: "hello" })

        if (nextRole === "host" && gameRef.current) {
          sendMessage({ type: "snapshot", game: gameRef.current })
        }
      })

      connection.on("data", handleRemoteMessage)
      connection.on("close", () => {
        setConnectionState("closed")
        setStatusText("Peer connection closed.")
      })
      connection.on("error", (error) => {
        setConnectionState("closed")
        setStatusText(error.message)
      })
    },
    [handleRemoteMessage, sendMessage]
  )

  const createRoom = useCallback(() => {
    resetSession()
    const nextSeed = Math.floor(Math.random() * 2_000_000_000)
    const firstGame = createGameState(1, nextSeed, difficulty)
    gameRef.current = firstGame
    setGame(firstGame)
    setRoundPhase("playing")
    setRole("host")
    roleRef.current = "host"
    setConnectionState("signaling")
    setStatusText("Opening PeerJS signaling channel.")

    const peer = new Peer({
      debug: 1,
    })
    peerRef.current = peer

    peer.on("open", (id) => {
      setPeerId(id)
      setInviteUrl(buildInviteUrl(id))
      setConnectionState("waiting")
      setStatusText("Room ready. Share the QR code with the second player.")
    })

    peer.on("connection", (connection) => {
      bindConnection(connection, "host")
    })

    peer.on("error", (error) => {
      setConnectionState("closed")
      setStatusText(error.message)
    })
  }, [bindConnection, difficulty, resetSession])

  const joinRoom = useCallback(
    (targetId: string) => {
      const trimmedId = targetId.trim()

      if (!trimmedId) {
        return
      }

      resetSession()
      setRole("guest")
      roleRef.current = "guest"
      setConnectionState("signaling")
      setStatusText("Opening PeerJS signaling channel.")

      const peer = new Peer({
        debug: 1,
      })
      peerRef.current = peer

      peer.on("open", (id) => {
        setPeerId(id)
        setConnectionState("connecting")
        setStatusText("Connecting to room host.")
        const connection = peer.connect(trimmedId, {
          label: "peer-maze",
          metadata: { demo: "peer-maze" },
          reliable: true,
          serialization: "json",
        })
        bindConnection(connection, "guest")
      })

      peer.on("error", (error) => {
        setConnectionState("closed")
        setStatusText(error.message)
      })
    },
    [bindConnection, resetSession]
  )

  useEffect(() => {
    if (hasAutoJoinedRef.current || !initialJoinIdRef.current || !canHost) {
      return
    }

    hasAutoJoinedRef.current = true
    joinRoom(initialJoinIdRef.current)
  }, [canHost, joinRoom])

  const updateLocalAxis = useCallback(
    (axis: number) => {
      const nextAxis = clampAxis(axis)
      localAxisRef.current = nextAxis
      setLocalAxis(nextAxis)

      if (roleRef.current === "guest") {
        sendMessage({ type: "input", axis: nextAxis })
      }
    },
    [sendMessage]
  )

  const updateLocalStick = useCallback(
    (vector: JoystickVector) => {
      updateLocalAxis(roleRef.current === "guest" ? vector.y : vector.x)
    },
    [updateLocalAxis]
  )

  const changeDifficulty = useCallback(
    (nextDifficulty: MazeDifficulty) => {
      setDifficulty(nextDifficulty)

      if (roleRef.current === "host" && connectionState === "connected") {
        sendMessage({ type: "difficulty", difficulty: nextDifficulty })
      }
    },
    [connectionState, sendMessage]
  )

  const startNextRound = useCallback(() => {
    const currentGame = gameRef.current

    if (roleRef.current !== "host" || !currentGame) {
      return
    }

    const nextGame = createGameState(
      currentGame.level + 1,
      Math.floor(Math.random() * 2_000_000_000),
      difficulty
    )
    gameRef.current = nextGame
    roundPhaseRef.current = "playing"
    localAxisRef.current = 0
    remoteAxisRef.current = 0
    setGame(nextGame)
    setLocalAxis(0)
    setRemoteAxis(0)
    setRoundPhase("playing")
    setStatusText(`Level ${nextGame.level} is live.`)
    sendMessage({ type: "snapshot", game: nextGame })
  }, [difficulty, sendMessage])

  useEffect(() => {
    if (role !== "guest" || connectionState !== "connected") {
      return
    }

    const timer = window.setInterval(() => {
      sendMessage({ type: "input", axis: localAxisRef.current })
    }, BROADCAST_INTERVAL)

    return () => window.clearInterval(timer)
  }, [connectionState, role, sendMessage])

  useEffect(() => {
    if (role !== "host") {
      return
    }

    let animationId = 0
    let lastTime = performance.now()
    let lastBroadcast = 0

    const tick = (time: number) => {
      const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time

      const currentGame = gameRef.current

      if (currentGame && roundPhaseRef.current === "playing") {
        const nextGame = advanceGame(
          currentGame,
          localAxisRef.current,
          remoteAxisRef.current,
          deltaSeconds
        )
        gameRef.current = nextGame
        setGame(nextGame)

        if (hasReachedExit(nextGame)) {
          roundPhaseRef.current = "complete"
          localAxisRef.current = 0
          remoteAxisRef.current = 0
          setLocalAxis(0)
          setRemoteAxis(0)
          setRoundPhase("complete")
          setStatusText(`Level ${nextGame.level} cleared. Choose the next maze.`)
          sendMessage({ type: "snapshot", game: nextGame })
          sendMessage({ type: "round-complete", level: nextGame.level })
          lastBroadcast = time
        }

        if (time - lastBroadcast > BROADCAST_INTERVAL) {
          sendMessage({ type: "snapshot", game: nextGame })
          lastBroadcast = time
        }
      }

      animationId = window.requestAnimationFrame(tick)
    }

    animationId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(animationId)
  }, [role, sendMessage])

  useEffect(() => {
    const pressedKeys = new Set<string>()

    const refreshAxis = () => {
      if (roleRef.current === "host") {
        updateLocalAxis(
          (pressedKeys.has("ArrowRight") ? 1 : 0) - (pressedKeys.has("ArrowLeft") ? 1 : 0)
        )
      }

      if (roleRef.current === "guest") {
        updateLocalAxis(
          (pressedKeys.has("ArrowDown") ? 1 : 0) - (pressedKeys.has("ArrowUp") ? 1 : 0)
        )
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return
      }

      pressedKeys.add(event.key)
      refreshAxis()
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        return
      }

      pressedKeys.delete(event.key)
      refreshAxis()
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [updateLocalAxis])

  useEffect(() => {
    return () => {
      connectionRef.current?.close()
      peerRef.current?.destroy()
    }
  }, [])

  const copied = useCallback(async () => {
    if (!inviteUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(inviteUrl)
      Toast.show({ content: "Invite link copied" })
    } catch {
      Toast.show({ content: "Copy failed. Select the link manually." })
    }
  }, [inviteUrl])

  if (isGamePhase) {
    return (
      <GameView
        connectionBadge={connectionBadge}
        difficulty={difficulty}
        game={game}
        localAxis={localAxis}
        onDifficultyChange={changeDifficulty}
        onClose={resetSession}
        onStartNextRound={startNextRound}
        onStickChange={updateLocalStick}
        remoteAxis={remoteAxis}
        role={role}
        roundPhase={roundPhase}
      />
    )
  }

  return (
    <LobbyView
      canHost={canHost}
      canJoin={canJoin}
      connectionBadge={connectionBadge}
      connectionState={connectionState}
      copied={copied}
      createRoom={createRoom}
      difficulty={difficulty}
      inviteUrl={inviteUrl}
      isSecureContext={isSecureContext}
      joinId={joinId}
      joinRoom={joinRoom}
      peerId={peerId}
      qrSrc={qrSrc}
      resetSession={resetSession}
      role={role}
      setDifficulty={changeDifficulty}
      setJoinId={setJoinId}
      statusText={statusText}
    />
  )
}

function LobbyView({
  canHost,
  canJoin,
  connectionBadge,
  connectionState,
  copied,
  createRoom,
  difficulty,
  inviteUrl,
  isSecureContext,
  joinId,
  joinRoom,
  peerId,
  qrSrc,
  resetSession,
  role,
  setDifficulty,
  setJoinId,
  statusText,
}: {
  canHost: boolean
  canJoin: boolean
  connectionBadge: ConnectionBadge
  connectionState: ConnectionState
  copied: () => void
  createRoom: () => void
  difficulty: MazeDifficulty
  inviteUrl: string
  isSecureContext: boolean
  joinId: string
  joinRoom: (targetId: string) => void
  peerId: string
  qrSrc: string
  resetSession: () => void
  role: Role | null
  setDifficulty: (difficulty: MazeDifficulty) => void
  setJoinId: (id: string) => void
  statusText: string
}) {
  return (
    <section className="page-stack peer-maze-page">
      <header className="page-header">
        <p className="eyebrow">PeerJS co-op</p>
        <h2>Two-player maze link</h2>
        <p>
          Host shares a QR invite, the second phone joins through PeerJS, and each player controls
          one movement axis through the same in-maze joystick.
        </p>
      </header>

      {!isSecureContext ? (
        <div className="maze-notice">
          Local HTTP is fine for quick testing. Public mobile tests should use HTTPS, especially for
          in-page camera scanning or a self-hosted PeerServer.
        </div>
      ) : null}

      <div className="maze-status-strip">
        <StatusPill label="Network" value={connectionBadge.label} tone={connectionBadge.tone} />
        <StatusPill label="Role" value={role ?? "none"} tone="neutral" />
        <StatusPill label="Phase" value="lobby" tone="gold" />
      </div>

      <div className="maze-lobby-grid">
        <Card className="maze-panel" title="Room">
          <div className="maze-room-stack">
            <p className="maze-status-text">{statusText}</p>

            <DifficultyPicker disabled={!canHost} onChange={setDifficulty} value={difficulty} />

            <Space block wrap>
              <Button color="primary" disabled={!canHost} onClick={createRoom}>
                Create room
              </Button>
              <Button disabled={connectionState === "idle"} fill="outline" onClick={resetSession}>
                Close
              </Button>
            </Space>

            <div className="maze-join-row">
              <Input
                clearable
                disabled={!canHost}
                onChange={setJoinId}
                placeholder="Paste host peer id"
                value={joinId}
              />
              <Button
                color="primary"
                disabled={!canJoin}
                fill="outline"
                onClick={() => joinRoom(joinId)}
              >
                Join
              </Button>
            </div>

            {peerId ? (
              <p className="maze-peer-id">
                Peer id <code>{peerId}</code>
              </p>
            ) : null}
          </div>
        </Card>

        {inviteUrl ? (
          <Card className="maze-panel" title="Invite">
            <div className="maze-invite">
              {qrSrc ? <img alt="Peer maze invite QR code" src={qrSrc} /> : null}
              <button className="maze-link-button" onClick={copied} type="button">
                {inviteUrl}
              </button>
            </div>
          </Card>
        ) : null}
      </div>
    </section>
  )
}

function GameView({
  connectionBadge,
  difficulty,
  game,
  localAxis,
  onClose,
  onDifficultyChange,
  onStartNextRound,
  onStickChange,
  remoteAxis,
  role,
  roundPhase,
}: {
  connectionBadge: ConnectionBadge
  difficulty: MazeDifficulty
  game: GameState
  localAxis: number
  onClose: () => void
  onDifficultyChange: (difficulty: MazeDifficulty) => void
  onStartNextRound: () => void
  onStickChange: (vector: JoystickVector) => void
  remoteAxis: number
  role: Role | null
  roundPhase: RoundPhase
}) {
  return (
    <section className="peer-maze-game">
      <div className="maze-game-hud">
        <div>
          <p className="eyebrow">Peer maze</p>
          <h2>Level {game.level}</h2>
        </div>
        <div className="maze-game-stats">
          <StatusPill label="Network" value={connectionBadge.label} tone={connectionBadge.tone} />
          <StatusPill label="Role" value={role ?? "none"} tone="neutral" />
          <StatusPill label="Maze" value={`${game.width} x ${game.height}`} tone="gold" />
        </div>
        <Button fill="outline" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="maze-game-stage">
        <MazeBoard
          difficulty={difficulty}
          game={game}
          localAxis={localAxis}
          onDifficultyChange={onDifficultyChange}
          onStartNextRound={onStartNextRound}
          onStickChange={onStickChange}
          remoteAxis={remoteAxis}
          role={role}
          roundPhase={roundPhase}
        />
      </div>
    </section>
  )
}

function MazeBoard({
  difficulty,
  game,
  localAxis,
  onDifficultyChange,
  onStartNextRound,
  onStickChange,
  remoteAxis,
  role,
  roundPhase,
}: {
  difficulty: MazeDifficulty
  game: GameState
  localAxis: number
  onDifficultyChange: (difficulty: MazeDifficulty) => void
  onStartNextRound: () => void
  onStickChange: (vector: JoystickVector) => void
  remoteAxis: number
  role: Role | null
  roundPhase: RoundPhase
}) {
  const hostAxis = role === "host" ? localAxis : remoteAxis
  const guestAxis = role === "guest" ? localAxis : remoteAxis
  const boardCells = useMemo(
    () =>
      game.cells.flatMap((row, rowIndex) =>
        Array.from(row).map((cell, columnIndex) => ({
          cell,
          id: `${game.level}-${columnIndex}-${rowIndex}`,
        }))
      ),
    [game]
  )

  return (
    <div className="maze-board-shell">
      <div
        className="maze-board"
        style={
          {
            "--maze-cols": game.width,
            "--maze-rows": game.height,
          } as CSSProperties
        }
      >
        {boardCells.map(({ cell, id }) => (
          <div className={cell === CELL_WALL ? "maze-cell wall" : "maze-cell open"} key={id} />
        ))}
        <div
          className="maze-exit"
          style={{
            left: `${((game.exitX + 0.5) / game.width) * 100}%`,
            top: `${((game.exitY + 0.5) / game.height) * 100}%`,
          }}
        />
        <div
          className="maze-player"
          style={{
            left: `${(game.playerX / game.width) * 100}%`,
            top: `${(game.playerY / game.height) * 100}%`,
            width: `${(0.76 / game.width) * 100}%`,
          }}
        />
        <div className="maze-joystick-overlay">
          <Joystick onChange={onStickChange} />
        </div>
        {roundPhase === "complete" ? (
          <div className="maze-round-overlay">
            <div className="maze-round-panel">
              <p className="eyebrow">Level clear</p>
              <h3>{role === "host" ? "Choose the next maze" : "Waiting for host"}</h3>
              <DifficultyPicker
                disabled={role !== "host"}
                onChange={onDifficultyChange}
                value={difficulty}
              />
              {role === "host" ? (
                <Button block color="primary" onClick={onStartNextRound}>
                  Start next maze
                </Button>
              ) : (
                <p className="maze-status-text">
                  Host selected {getDifficultyOption(difficulty).label}.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <div className="maze-axis-readout">
        <Tag color="primary">LR {formatAxis(hostAxis)}</Tag>
        <Tag color="warning">UD {formatAxis(guestAxis)}</Tag>
      </div>
    </div>
  )
}

function DifficultyPicker({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean
  onChange: (difficulty: MazeDifficulty) => void
  value: MazeDifficulty
}) {
  return (
    <div className="maze-difficulty-grid">
      {DIFFICULTIES.map((option) => (
        <button
          className={`maze-difficulty ${value === option.id ? "active" : ""}`}
          disabled={disabled}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          <strong>{option.label}</strong>
          <span>{option.detail}</span>
        </button>
      ))}
    </div>
  )
}

function Joystick({ onChange }: { onChange: (value: JoystickVector) => void }) {
  const padRef = useRef<HTMLDivElement | null>(null)
  const [value, setValue] = useState<JoystickVector>({ x: 0, y: 0 })

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const pad = padRef.current

      if (!pad) {
        return
      }

      const rect = pad.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const radius = Math.min(rect.width, rect.height) / 2
      const rawX = clampAxis((clientX - centerX) / radius)
      const rawY = clampAxis((clientY - centerY) / radius)
      const length = Math.hypot(rawX, rawY)
      const nextValue =
        length > 1
          ? {
              x: rawX / length,
              y: rawY / length,
            }
          : {
              x: rawX,
              y: rawY,
            }
      setValue(nextValue)
      onChange(nextValue)
    },
    [onChange]
  )

  const reset = useCallback(() => {
    const nextValue = { x: 0, y: 0 }
    setValue(nextValue)
    onChange(nextValue)
  }, [onChange])

  return (
    <div className="joystick-wrap">
      <div
        className="joystick-pad"
        onPointerCancel={reset}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFromPointer(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event.clientX, event.clientY)
          }
        }}
        onPointerUp={reset}
        ref={padRef}
      >
        <div
          className="joystick-thumb"
          style={{
            transform: `translate(${value.x * 46}px, ${value.y * 46}px)`,
          }}
        />
      </div>
    </div>
  )
}

function StatusPill({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "good" | "neutral" | "warn" | "gold"
}) {
  return (
    <div className={`status-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getConnectionBadge(connectionState: ConnectionState): {
  label: string
  tone: "good" | "neutral" | "warn"
} {
  if (connectionState === "connected") {
    return { label: "connected", tone: "good" }
  }

  if (connectionState === "closed") {
    return { label: "closed", tone: "warn" }
  }

  return { label: connectionState, tone: "neutral" }
}

function createGameState(level: number, seed: number, difficulty: MazeDifficulty): GameState {
  const difficultyOption = getDifficultyOption(difficulty)
  const size = Math.min(
    difficultyOption.baseSize + Math.floor((level - 1) / 2) * 2,
    difficultyOption.maxSize
  )
  const cells = generateMaze(size, size, seed + level * 99991)

  return {
    level,
    seed,
    difficulty,
    width: size,
    height: size,
    cells,
    playerX: 1.5,
    playerY: 1.5,
    exitX: size - 2,
    exitY: size - 2,
  }
}

function generateMaze(width: number, height: number, seed: number): string[] {
  const random = mulberry32(seed)
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => CELL_WALL))
  const stack: Array<[number, number]> = [[1, 1]]
  grid[1][1] = CELL_OPEN

  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1]
    const directions = shuffle(
      [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const,
      random
    )
    const nextDirection = directions.find(([dx, dy]) => {
      const nextX = x + dx
      const nextY = y + dy

      return (
        nextX > 0 &&
        nextX < width - 1 &&
        nextY > 0 &&
        nextY < height - 1 &&
        grid[nextY][nextX] === CELL_WALL
      )
    })

    if (!nextDirection) {
      stack.pop()
      continue
    }

    const [dx, dy] = nextDirection
    grid[y + dy / 2][x + dx / 2] = CELL_OPEN
    grid[y + dy][x + dx] = CELL_OPEN
    stack.push([x + dx, y + dy])
  }

  grid[height - 2][width - 2] = CELL_OPEN

  return grid.map((row) => row.join(""))
}

function advanceGame(
  game: GameState,
  horizontalAxis: number,
  verticalAxis: number,
  deltaSeconds: number
): GameState {
  let nextX = game.playerX
  let nextY = game.playerY
  const distance = PLAYER_SPEED * deltaSeconds
  const candidateX = nextX + horizontalAxis * distance

  if (canOccupy(game, candidateX, nextY)) {
    nextX = candidateX
  }

  const candidateY = nextY + verticalAxis * distance

  if (canOccupy(game, nextX, candidateY)) {
    nextY = candidateY
  }

  if (nextX === game.playerX && nextY === game.playerY) {
    return game
  }

  return {
    ...game,
    playerX: nextX,
    playerY: nextY,
  }
}

function hasReachedExit(game: GameState): boolean {
  const exitCenterX = game.exitX + 0.5
  const exitCenterY = game.exitY + 0.5

  return Math.hypot(game.playerX - exitCenterX, game.playerY - exitCenterY) < 0.48
}

function canOccupy(game: GameState, x: number, y: number): boolean {
  const points = [
    [x - PLAYER_RADIUS, y - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, y - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, y + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, y + PLAYER_RADIUS],
  ]

  return points.every(([pointX, pointY]) => {
    const cellX = Math.floor(pointX)
    const cellY = Math.floor(pointY)

    return (
      cellX >= 0 &&
      cellX < game.width &&
      cellY >= 0 &&
      cellY < game.height &&
      game.cells[cellY]?.[cellX] === CELL_OPEN
    )
  })
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }

  return copy
}

function mulberry32(seed: number): () => number {
  let state = seed

  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function buildInviteUrl(peerId: string): string {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("join", peerId)

  return url.toString()
}

function isNetworkMessage(message: unknown): message is NetworkMessage {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false
  }

  const typedMessage = message as {
    type: unknown
    axis?: unknown
    difficulty?: unknown
    game?: unknown
    level?: unknown
  }

  if (typedMessage.type === "input") {
    return typeof typedMessage.axis === "number"
  }

  if (typedMessage.type === "snapshot") {
    return isGameState(typedMessage.game)
  }

  if (typedMessage.type === "difficulty") {
    return isMazeDifficulty(typedMessage.difficulty)
  }

  if (typedMessage.type === "round-complete") {
    return typeof typedMessage.level === "number"
  }

  return typedMessage.type === "hello"
}

function isGameState(game: unknown): game is GameState {
  if (!game || typeof game !== "object") {
    return false
  }

  const candidate = game as GameState

  return (
    typeof candidate.level === "number" &&
    typeof candidate.seed === "number" &&
    isMazeDifficulty(candidate.difficulty) &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number" &&
    Array.isArray(candidate.cells) &&
    typeof candidate.playerX === "number" &&
    typeof candidate.playerY === "number" &&
    typeof candidate.exitX === "number" &&
    typeof candidate.exitY === "number"
  )
}

function getDifficultyOption(difficulty: MazeDifficulty) {
  return DIFFICULTIES.find((option) => option.id === difficulty) ?? DIFFICULTIES[1]
}

function isMazeDifficulty(value: unknown): value is MazeDifficulty {
  return value === "compact" || value === "standard" || value === "expert"
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(-1, Math.min(1, value))
}

function formatAxis(value: number): string {
  return value >= 0 ? `+${value.toFixed(2)}` : value.toFixed(2)
}
