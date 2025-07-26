import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeX } from 'lucide-react';

// Game Configuration - Easy to tweak probabilities and settings
const BOARD_SIZE = 8;
const MIN_MATCH = 3;
const POINTS_PER_TILE = 10;
const CHAIN_MULTIPLIER = 1.5;

// Emoji Families with upgrade paths
const EMOJI_FAMILIES = {
  HAPPY: ['😄', '😊', '😂', '😍'],
  SAD: ['😔', '😢', '😭'],
  ANGRY: ['😠', '😡', '🤬'],
  FOOD: ['🍕', '🍔', '🍩']
} as const;

// Special emojis
const SPECIAL_EMOJIS = {
  WILDCARD: '🌈',
  BOMB: '💣',
  BLOCKER: '💩',
  NEUTRAL: '😐',
  EXPLOSION: '🤯'
} as const;

// Weighted probabilities for random generation
const EMOJI_WEIGHTS = {
  HAPPY: 0.4,
  SAD: 0.25,
  ANGRY: 0.2,
  FOOD: 0.15
};

type EmojiType = string;
type Position = { row: number; col: number };
type TileState = 'normal' | 'selected' | 'matched' | 'falling' | 'exploding';

interface Tile {
  emoji: EmojiType;
  state: TileState;
  id: string;
}

interface ScorePopup {
  id: string;
  points: number;
  x: number;
  y: number;
  type: 'normal' | 'chain' | 'upgrade' | 'bomb';
  timestamp: number;
  emotionName?: string;
  matchSize?: number;
}

interface GameState {
  board: Tile[][];
  score: number;
  selectedTile: Position | null;
  isProcessing: boolean;
  chainCount: number;
  moves: number;
  scorePopups: ScorePopup[];
  lastScoreGain: number;
  timeRemaining: number;
  isGameOver: boolean;
  finalScore: number;
  gameStarted: boolean;
}

// Audio System Class for Arcade-Style Sounds
class AudioSystem {
  private audioContext: AudioContext | null = null;
  private backgroundMusic: AudioBufferSourceNode | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new AudioContext();
      this.isInitialized = true;
      this.startBackgroundMusic();
    } catch (error) {
      console.log('Audio not supported:', error);
    }
  }

  private createTone(frequency: number, duration: number, volume: number = 0.1, type: OscillatorType = 'sine') {
    if (!this.audioContext || this.isMuted) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  private startBackgroundMusic() {
    if (!this.audioContext || this.isMuted) return;

    // Create a fast-paced procedural background loop for maximum adrenaline
    const playMusicLoop = () => {
      if (this.isMuted || !this.audioContext) return;

      // Faster chord progression with more energy
      const chords = [
        [261.63, 329.63, 392.00], // C major
        [246.94, 311.13, 369.99], // B minor  
        [220.00, 277.18, 329.63], // A minor
        [196.00, 246.94, 293.66], // G major
        [293.66, 369.99, 440.00], // D major (added for more progression)
        [246.94, 311.13, 369.99], // B minor (repeat for tension)
      ];

      chords.forEach((chord, index) => {
        setTimeout(() => {
          chord.forEach(freq => {
            // Shorter, punchier chords with slight volume variation for rhythm
            this.createTone(freq, 0.4, 0.04 + (index % 2) * 0.01, 'triangle');
            // Add a bass note for more drive
            this.createTone(freq / 2, 0.3, 0.02, 'sawtooth');
          });
          
          // Add rhythmic high-hat style percussion
          setTimeout(() => {
            this.createTone(2000 + Math.random() * 500, 0.05, 0.015, 'square');
          }, 200);
        }, index * 500); // Much faster: 0.5 seconds per chord instead of 2
      });

      // Loop every 3 seconds instead of 8 for constant energy
      setTimeout(playMusicLoop, 3000);
    };

    playMusicLoop();
  }

  playSwapSound() {
    this.createTone(440, 0.1, 0.1, 'square');
  }

  playMatchSound(matchSize: number) {
    // Higher pitch for bigger matches
    const baseFreq = 523.25; // C5
    const frequency = baseFreq + (matchSize - 3) * 100;
    this.createTone(frequency, 0.3, 0.15, 'sine');
    
    // Add a second harmonic for richness
    setTimeout(() => {
      this.createTone(frequency * 1.5, 0.2, 0.08, 'sine');
    }, 50);
  }

  playChainSound(chainCount: number) {
    // Ascending notes for chains
    const frequencies = [659.25, 783.99, 987.77, 1174.66]; // E5, G5, B5, D6
    const freq = frequencies[Math.min(chainCount - 1, frequencies.length - 1)];
    this.createTone(freq, 0.4, 0.12, 'square');
  }

  playBombSound() {
    // Explosion sound effect
    this.createTone(100, 0.1, 0.2, 'sawtooth');
    setTimeout(() => this.createTone(80, 0.2, 0.15, 'sawtooth'), 50);
    setTimeout(() => this.createTone(60, 0.3, 0.1, 'sawtooth'), 100);
  }

  playUpgradeSound() {
    // Magical upgrade chime
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, 0.5, 0.08, 'sine');
      }, index * 80);
    });
  }

  playMegaComboSound() {
    // Epic sound for huge scores
    const frequencies = [440, 554.37, 659.25, 830.61]; // A4, C#5, E5, G#5
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, 0.8, 0.12, 'sine');
        this.createTone(freq * 2, 0.6, 0.06, 'triangle');
      }, index * 120);
    });
  }

  playScoreSound(points: number) {
    // Different sounds based on score amount
    if (points >= 100) {
      this.playMegaComboSound();
    } else if (points >= 50) {
      this.createTone(880, 0.4, 0.1, 'triangle'); // High reward sound
    } else {
      this.createTone(440, 0.2, 0.08, 'sine'); // Standard score sound
    }
  }

  playTimerWarning() {
    // Urgent warning sound for low time
    this.createTone(800, 0.2, 0.15, 'square');
    setTimeout(() => this.createTone(600, 0.2, 0.15, 'square'), 200);
  }

  playGameOverSound() {
    // Descending game over sound
    const frequencies = [440, 370, 311, 261]; // A4 to C4
    frequencies.forEach((freq, index) => {
      setTimeout(() => {
        this.createTone(freq, 0.8, 0.1, 'triangle');
      }, index * 300);
    });
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  getMuteState() {
    return this.isMuted;
  }
}

const EmojiAlchemyGame = () => {
  const audioSystem = useRef(new AudioSystem());
  const [isMuted, setIsMuted] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    score: 0,
    selectedTile: null,
    isProcessing: false,
    chainCount: 0,
    moves: 0,
    scorePopups: [],
    lastScoreGain: 0,
    timeRemaining: 120, // 2 minutes
    isGameOver: false,
    finalScore: 0,
    gameStarted: false
  });

  // Initialize random board
  const generateRandomEmoji = useCallback((): string => {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [family, weight] of Object.entries(EMOJI_WEIGHTS)) {
      cumulative += weight;
      if (rand <= cumulative) {
        const familyEmojis = EMOJI_FAMILIES[family as keyof typeof EMOJI_FAMILIES];
        return familyEmojis[Math.floor(Math.random() * familyEmojis.length)];
      }
    }
    
    return EMOJI_FAMILIES.HAPPY[0];
  }, []);

  const createTile = useCallback((emoji?: string): Tile => ({
    emoji: emoji || generateRandomEmoji(),
    state: 'normal',
    id: Math.random().toString(36).substr(2, 9)
  }), [generateRandomEmoji]);

  const initializeBoard = useCallback((): Tile[][] => {
    const board: Tile[][] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      board[row] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        board[row][col] = createTile();
      }
    }
    return board;
  }, [createTile]);

  // Get emoji family
  const getEmojiFamily = (emoji: string): string | null => {
    for (const [family, emojis] of Object.entries(EMOJI_FAMILIES)) {
      if ((emojis as readonly string[]).includes(emoji)) return family;
    }
    return null;
  };

  // Get human-readable emotion name
  const getEmotionName = (family: string | null): string => {
    if (!family) return 'Mixed';
    switch (family) {
      case 'HAPPY': return 'Happy';
      case 'SAD': return 'Sad';
      case 'ANGRY': return 'Angry';
      case 'FOOD': return 'Tasty';
      default: return 'Special';
    }
  };

  // Check if two emojis match (same family or wildcard)
  const emojisMatch = (emoji1: string, emoji2: string): boolean => {
    if (emoji1 === emoji2) return true;
    if (emoji1 === SPECIAL_EMOJIS.WILDCARD || emoji2 === SPECIAL_EMOJIS.WILDCARD) return true;
    const family1 = getEmojiFamily(emoji1);
    const family2 = getEmojiFamily(emoji2);
    return family1 !== null && family1 === family2;
  };

  // Find matches on the board
  const findMatches = useCallback((board: Tile[][]): Position[] => {
    const matches: Position[] = [];
    const visited = new Set<string>();

    // Check horizontal matches
    for (let row = 0; row < BOARD_SIZE; row++) {
      let count = 1;
      let currentEmoji = board[row][0].emoji;
      
      for (let col = 1; col < BOARD_SIZE; col++) {
        if (emojisMatch(board[row][col].emoji, currentEmoji) && 
            board[row][col].emoji !== SPECIAL_EMOJIS.BLOCKER) {
          count++;
        } else {
          if (count >= MIN_MATCH) {
            for (let i = col - count; i < col; i++) {
              const key = `${row},${i}`;
              if (!visited.has(key)) {
                matches.push({ row, col: i });
                visited.add(key);
              }
            }
          }
          count = 1;
          currentEmoji = board[row][col].emoji;
        }
      }
      
      if (count >= MIN_MATCH) {
        for (let i = BOARD_SIZE - count; i < BOARD_SIZE; i++) {
          const key = `${row},${i}`;
          if (!visited.has(key)) {
            matches.push({ row, col: i });
            visited.add(key);
          }
        }
      }
    }

    // Check vertical matches
    for (let col = 0; col < BOARD_SIZE; col++) {
      let count = 1;
      let currentEmoji = board[0][col].emoji;
      
      for (let row = 1; row < BOARD_SIZE; row++) {
        if (emojisMatch(board[row][col].emoji, currentEmoji) && 
            board[row][col].emoji !== SPECIAL_EMOJIS.BLOCKER) {
          count++;
        } else {
          if (count >= MIN_MATCH) {
            for (let i = row - count; i < row; i++) {
              const key = `${i},${col}`;
              if (!visited.has(key)) {
                matches.push({ row: i, col });
                visited.add(key);
              }
            }
          }
          count = 1;
          currentEmoji = board[row][col].emoji;
        }
      }
      
      if (count >= MIN_MATCH) {
        for (let i = BOARD_SIZE - count; i < BOARD_SIZE; i++) {
          const key = `${i},${col}`;
          if (!visited.has(key)) {
            matches.push({ row: i, col });
            visited.add(key);
          }
        }
      }
    }

    return matches;
  }, []);

  // Apply alchemy rules for 4+ matches
  const applyAlchemy = useCallback((matches: Position[], board: Tile[][]): { newBoard: Tile[][]; bonusScore: number } => {
    const newBoard = board.map(row => [...row]);
    let bonusScore = 0;

    if (matches.length >= 4) {
      const firstMatch = matches[0];
      const emoji = board[firstMatch.row][firstMatch.col].emoji;
      const family = getEmojiFamily(emoji);

      if (family && EMOJI_FAMILIES[family as keyof typeof EMOJI_FAMILIES]) {
        const familyEmojis = EMOJI_FAMILIES[family as keyof typeof EMOJI_FAMILIES];
        const currentIndex = (familyEmojis as readonly string[]).indexOf(emoji);
        
        if (currentIndex < familyEmojis.length - 1) {
          // Upgrade to next tier
          const upgradedEmoji = familyEmojis[currentIndex + 1];
          newBoard[firstMatch.row][firstMatch.col] = createTile(upgradedEmoji);
          bonusScore += 50;
        } else {
          // Max tier reached, create bomb
          newBoard[firstMatch.row][firstMatch.col] = createTile(SPECIAL_EMOJIS.BOMB);
          bonusScore += 100;
        }
      }
    }

    return { newBoard, bonusScore };
  }, [createTile]);

  // Handle bomb explosions
  const explodeBombs = useCallback((board: Tile[][]): Tile[][] => {
    const newBoard = board.map(row => [...row]);
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col].emoji === SPECIAL_EMOJIS.BOMB) {
          // Clear 3x3 area around bomb
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const newRow = row + dr;
              const newCol = col + dc;
              if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
                newBoard[newRow][newCol] = createTile();
              }
            }
          }
        }
      }
    }
    
    return newBoard;
  }, [createTile]);

  // Make tiles fall down
  const applyGravity = useCallback((board: Tile[][]): Tile[][] => {
    const newBoard = board.map(row => [...row]);
    
    for (let col = 0; col < BOARD_SIZE; col++) {
      const column = [];
      
      // Collect non-empty tiles
      for (let row = BOARD_SIZE - 1; row >= 0; row--) {
        if (newBoard[row][col]) {
          column.push(newBoard[row][col]);
        }
      }
      
      // Fill column from bottom
      for (let row = BOARD_SIZE - 1; row >= 0; row--) {
        if (column.length > 0) {
          newBoard[row][col] = column.shift()!;
          newBoard[row][col].state = 'falling';
        } else {
          newBoard[row][col] = createTile();
          newBoard[row][col].state = 'falling';
        }
      }
    }
    
    return newBoard;
  }, [createTile]);

  // Create score popup
  const createScorePopup = useCallback((
    points: number, 
    type: ScorePopup['type'] = 'normal',
    emotionName?: string,
    matchSize?: number
  ): ScorePopup => ({
    id: Math.random().toString(36).substr(2, 9),
    points,
    x: Math.random() * 300 + 50, // Random position for visual variety
    y: Math.random() * 100 + 200,
    type,
    timestamp: Date.now(),
    emotionName,
    matchSize
  }), []);

  // Clean up old score popups
  const cleanupScorePopups = useCallback(() => {
    const now = Date.now();
    setGameState(prev => ({
      ...prev,
      scorePopups: prev.scorePopups.filter(popup => now - popup.timestamp < 2000)
    }));
  }, []);

  // Auto cleanup score popups
  useEffect(() => {
    const interval = setInterval(cleanupScorePopups, 1000);
    return () => clearInterval(interval);
  }, [cleanupScorePopups]);

  // Process matches and cascades
  const processMatches = useCallback(async () => {
    setGameState(prev => ({ ...prev, isProcessing: true }));
    
    let currentBoard = [...gameState.board];
    let totalScore = gameState.score;
    let chainCount = 0;
    
    while (true) {
      const matches = findMatches(currentBoard);
      
      if (matches.length === 0) break;
      
      chainCount++;
      
      // Play audio effects
      audioSystem.current.playMatchSound(matches.length);
      if (chainCount > 1) {
        audioSystem.current.playChainSound(chainCount);
      }
      
      // Mark matched tiles
      matches.forEach(({ row, col }) => {
        currentBoard[row][col].state = 'matched';
      });
      
      // Apply alchemy for 4+ matches
      if (matches.length >= 4) {
        const { newBoard, bonusScore } = applyAlchemy(matches, currentBoard);
        currentBoard = newBoard;
        totalScore += bonusScore;
        audioSystem.current.playUpgradeSound();
      }
      
      // Calculate score with chain multiplier
      const baseScore = matches.length * POINTS_PER_TILE;
      const chainBonus = Math.floor(baseScore * (CHAIN_MULTIPLIER ** (chainCount - 1)));
      const totalRoundScore = baseScore + chainBonus;
      totalScore += totalRoundScore;
      
      // Get the emotion name from the first matched emoji
      const firstMatchEmoji = currentBoard[matches[0].row][matches[0].col].emoji;
      const emotionFamily = getEmojiFamily(firstMatchEmoji);
      const emotionName = getEmotionName(emotionFamily);
      
      // Create score popup and play score sound
      const popupType = chainCount > 1 ? 'chain' : 'normal';
      const scorePopup = createScorePopup(totalRoundScore, popupType, emotionName, matches.length);
      audioSystem.current.playScoreSound(totalRoundScore);
      
      // Add popup to game state
      setGameState(prev => ({
        ...prev,
        scorePopups: [...prev.scorePopups, scorePopup],
        lastScoreGain: totalRoundScore
      }));
      
      // Clear matched tiles
      matches.forEach(({ row, col }) => {
        currentBoard[row][col] = createTile();
      });
      
      // Handle bomb explosions
      const hasBombs = currentBoard.some(row => row.some(tile => tile.emoji === SPECIAL_EMOJIS.BOMB));
      if (hasBombs) {
        audioSystem.current.playBombSound();
      }
      currentBoard = explodeBombs(currentBoard);
      
      // Apply gravity
      currentBoard = applyGravity(currentBoard);
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    // Reset tile states
    currentBoard = currentBoard.map(row => 
      row.map(tile => ({ ...tile, state: 'normal' }))
    );
    
    setGameState(prev => ({
      ...prev,
      board: currentBoard,
      score: totalScore,
      chainCount,
      isProcessing: false,
      selectedTile: null
    }));
  }, [gameState.board, gameState.score, findMatches, applyAlchemy, explodeBombs, applyGravity, createTile]);

  // Handle tile selection and swapping
  const handleTileClick = useCallback((row: number, col: number) => {
    if (gameState.isProcessing || gameState.isGameOver) return;
    
    // Start the game on first move
    if (!gameState.gameStarted) {
      setGameState(prev => ({ ...prev, gameStarted: true }));
    }
    
    const currentPos = { row, col };
    
    if (!gameState.selectedTile) {
      // First selection
      setGameState(prev => ({
        ...prev,
        selectedTile: currentPos,
        board: prev.board.map((r, rIdx) =>
          r.map((tile, cIdx) => ({
            ...tile,
            state: rIdx === row && cIdx === col ? 'selected' : 'normal'
          }))
        )
      }));
    } else {
      const { row: selectedRow, col: selectedCol } = gameState.selectedTile;
      
      // Check if tiles are adjacent
      const isAdjacent = 
        (Math.abs(row - selectedRow) === 1 && col === selectedCol) ||
        (Math.abs(col - selectedCol) === 1 && row === selectedRow);
      
      if (isAdjacent) {
        // Play swap sound
        audioSystem.current.playSwapSound();
        
        // Perform swap
        const newBoard = [...gameState.board];
        const temp = newBoard[row][col];
        newBoard[row][col] = newBoard[selectedRow][selectedCol];
        newBoard[selectedRow][selectedCol] = temp;
        
        // Reset states
        newBoard[row][col].state = 'normal';
        newBoard[selectedRow][selectedCol].state = 'normal';
        
        setGameState(prev => ({
          ...prev,
          board: newBoard,
          selectedTile: null,
          moves: prev.moves + 1
        }));
        
        // Check for matches after a short delay
        setTimeout(() => {
          processMatches();
        }, 100);
      } else {
        // Invalid move, reset selection
        setGameState(prev => ({
          ...prev,
          selectedTile: null,
          board: prev.board.map(row => 
            row.map(tile => ({ ...tile, state: 'normal' }))
          )
        }));
      }
    }
  }, [gameState.selectedTile, gameState.isProcessing, gameState.board, processMatches]);

  // Reset game
  const resetGame = useCallback(() => {
    setGameState({
      board: initializeBoard(),
      score: 0,
      selectedTile: null,
      isProcessing: false,
      chainCount: 0,
      moves: 0,
      scorePopups: [],
      lastScoreGain: 0,
      timeRemaining: 120, // 2 minutes
      isGameOver: false,
      finalScore: 0,
      gameStarted: false
    });
  }, [initializeBoard]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    const newMuteState = audioSystem.current.toggleMute();
    setIsMuted(newMuteState);
  }, []);

  // Initialize audio on first user interaction
  const initializeAudio = useCallback(() => {
    audioSystem.current.initialize();
  }, []);

  // Initialize game on mount and set up audio
  useEffect(() => {
    setGameState(prev => ({ ...prev, board: initializeBoard() }));
    
    // Initialize audio on first click anywhere
    const handleFirstInteraction = () => {
      initializeAudio();
      document.removeEventListener('click', handleFirstInteraction);
    };
    
    document.addEventListener('click', handleFirstInteraction);
    
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [initializeBoard, initializeAudio]);

  // Timer countdown logic
  useEffect(() => {
    if (!gameState.gameStarted || gameState.isGameOver || gameState.timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setGameState(prev => {
        const newTime = prev.timeRemaining - 1;
        
        // Play warning sounds
        if (newTime === 30 || newTime === 10 || newTime === 5) {
          audioSystem.current.playTimerWarning();
        }
        
        // Game over when time reaches 0
        if (newTime <= 0) {
          audioSystem.current.playGameOverSound();
          const efficiency = prev.moves > 0 ? Math.round(prev.score / prev.moves) : prev.score;
          const finalScore = prev.score + efficiency; // Bonus for efficiency
          
          return {
            ...prev,
            timeRemaining: 0,
            isGameOver: true,
            finalScore,
            isProcessing: false
          };
        }
        
        return { ...prev, timeRemaining: newTime };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState.gameStarted, gameState.isGameOver, gameState.timeRemaining]);

  // Format time display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get timer color based on remaining time
  const getTimerColor = (): string => {
    if (gameState.timeRemaining <= 10) return 'text-destructive';
    if (gameState.timeRemaining <= 30) return 'text-accent';
    return 'text-secondary';
  };

  const getTileClassName = (tile: Tile) => {
    const baseClasses = "w-12 h-12 flex items-center justify-center text-2xl cursor-pointer transition-all duration-300 rounded-lg border-2 border-game-tile";
    
    switch (tile.state) {
      case 'selected':
        return `${baseClasses} bg-game-tile-selected animate-glow-pulse scale-110`;
      case 'matched':
        return `${baseClasses} bg-game-tile-matched animate-match-flash`;
      case 'falling':
        return `${baseClasses} bg-game-tile animate-fall-down`;
      case 'exploding':
        return `${baseClasses} bg-destructive animate-explode`;
      default:
        return `${baseClasses} bg-game-tile hover:bg-game-tile-hover hover:scale-105`;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-cosmic p-4 flex flex-col items-center">
      <div className="max-w-4xl w-full">
        {/* Header Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-3">
            <Button 
              onClick={resetGame} 
              variant="outline" 
              size="sm"
              disabled={gameState.isProcessing}
            >
              New Game
            </Button>
            <Button 
              onClick={toggleMute}
              variant="outline" 
              size="sm"
            >
              {isMuted ? <VolumeX className="w-4 h-4 mr-2" /> : <Volume2 className="w-4 h-4 mr-2" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </Button>
          </div>
          <div className="text-foreground/60 text-sm">
            🕹️ Emoji Game
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-magic bg-clip-text text-transparent mb-4">
            🕹️ Emoji Game 🕹️
          </h1>
          <p className="text-foreground/80 text-lg">
            Match 3+ emojis to trigger emotional reactions!
          </p>
        </div>

        {/* Game Stats - Now 4 columns with Timer */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-card/90 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-center">Score</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold bg-gradient-score bg-clip-text text-transparent text-center">
                {gameState.score.toLocaleString()}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-center">Time</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className={`text-3xl font-bold text-center ${getTimerColor()}`}>
                {formatTime(gameState.timeRemaining)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-center">Moves</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-primary text-center">
                {gameState.moves}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-center">Chain</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-3xl font-bold text-secondary text-center">
                {gameState.chainCount}x
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Game Board with Score Popups */}
        <Card className="bg-game-board/90 backdrop-blur-sm p-6 mb-6 relative overflow-hidden">
          <div className="grid grid-cols-8 gap-2 max-w-md mx-auto">
            {gameState.board.map((row, rowIndex) =>
              row.map((tile, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}-${tile.id}`}
                  className={getTileClassName(tile)}
                  onClick={() => handleTileClick(rowIndex, colIndex)}
                >
                  {tile.emoji}
                </div>
              ))
            )}
          </div>

          {/* Score Popups */}
          {gameState.scorePopups.map((popup) => (
            <div
              key={popup.id}
              className={`absolute pointer-events-none animate-bounce-in font-bold z-10 ${
                popup.type === 'chain' ? 'text-secondary' :
                popup.type === 'upgrade' ? 'text-accent' :
                popup.type === 'bomb' ? 'text-destructive' : 
                'text-primary'
              }`}
              style={{
                left: `${popup.x}px`,
                top: `${popup.y}px`,
                animation: 'bounce-in 0.6s ease-out, fade-out 1s ease-out 1s forwards'
              }}
            >
              <div className="text-center">
                <div className="text-xl">+{popup.points}</div>
                <div className="text-sm opacity-90 font-medium">
                  {popup.emotionName && `${popup.emotionName} ${popup.matchSize || 3}`}
                  {popup.type === 'chain' && ' ⚡'}
                  {popup.type === 'upgrade' && ' ✨'}
                  {popup.type === 'bomb' && ' 💥'}
                </div>
              </div>
            </div>
          ))}

          {/* Last Score Display */}
          {gameState.lastScoreGain > 0 && (
            <div className="absolute top-4 right-4 bg-primary/20 backdrop-blur-sm rounded-lg px-3 py-1">
              <span className="text-primary font-bold">+{gameState.lastScoreGain}</span>
            </div>
          )}
        </Card>

        {/* Game Over Overlay */}
        {gameState.isGameOver && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="bg-card border-primary border-2 shadow-2xl animate-bounce-in">
              <CardHeader className="text-center">
                <CardTitle className="text-3xl text-primary mb-2">⏰ Time's Up!</CardTitle>
                <p className="text-foreground/80">Your emotional reactions have ended</p>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-primary">{gameState.score.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Base Score</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-accent">+{gameState.finalScore - gameState.score}</div>
                    <div className="text-sm text-muted-foreground">Efficiency Bonus</div>
                  </div>
                </div>
                
                <div className="border-t border-border pt-4">
                  <div className="text-4xl font-bold bg-gradient-score bg-clip-text text-transparent">
                    {gameState.finalScore.toLocaleString()}
                  </div>
                  <div className="text-lg text-foreground/80">Final Score</div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                  <div>
                    <div className="font-semibold">{gameState.moves}</div>
                    <div>Total Moves</div>
                  </div>
                  <div>
                    <div className="font-semibold">{gameState.moves > 0 ? Math.round(gameState.score / gameState.moves) : 0}</div>
                    <div>Points/Move</div>
                  </div>
                </div>

                <Button 
                  onClick={resetGame} 
                  className="w-full"
                  size="lg"
                >
                  Play Again 🎮
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Game Rules */}
        <Card className="bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-center">🎮 How to Play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Basic Rules:</h4>
                <ul className="text-sm space-y-1 text-foreground/80">
                  <li>• Click two adjacent tiles to swap them</li>
                  <li>• Match 3+ emojis in a row/column to clear them</li>
                  <li>• New emojis fall from the top</li>
                  <li>• Chain reactions multiply your score!</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Emotional Reaction:</h4>
                <ul className="text-sm space-y-1 text-foreground/80">
                  <li>• 4+ matches upgrade emojis</li>
                  <li>• 😄→😊→😂→😍 (happiness chain)</li>
                  <li>• 🍕→🍔→🍩 (food evolution)</li>
                  <li>• Special combos create bombs 💣</li>
                </ul>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-center pt-4 border-t border-border">
              <Badge variant="outline">Happy: 😄😊😂😍</Badge>
              <Badge variant="outline">Sad: 😔😢😭</Badge>
              <Badge variant="outline">Angry: 😠😡🤬</Badge>
              <Badge variant="outline">Food: 🍕🍔🍩</Badge>
              <Badge variant="outline">Special: 🌈💣💩</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmojiAlchemyGame;