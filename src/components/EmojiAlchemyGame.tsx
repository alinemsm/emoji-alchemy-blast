import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

interface GameState {
  board: Tile[][];
  score: number;
  selectedTile: Position | null;
  isProcessing: boolean;
  chainCount: number;
  moves: number;
}

const EmojiAlchemyGame = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    score: 0,
    selectedTile: null,
    isProcessing: false,
    chainCount: 0,
    moves: 0
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
      
      // Mark matched tiles
      matches.forEach(({ row, col }) => {
        currentBoard[row][col].state = 'matched';
      });
      
      // Apply alchemy for 4+ matches
      if (matches.length >= 4) {
        const { newBoard, bonusScore } = applyAlchemy(matches, currentBoard);
        currentBoard = newBoard;
        totalScore += bonusScore;
      }
      
      // Calculate score with chain multiplier
      const baseScore = matches.length * POINTS_PER_TILE;
      const chainBonus = Math.floor(baseScore * (CHAIN_MULTIPLIER ** (chainCount - 1)));
      totalScore += baseScore + chainBonus;
      
      // Clear matched tiles
      matches.forEach(({ row, col }) => {
        currentBoard[row][col] = createTile();
      });
      
      // Handle bomb explosions
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
    if (gameState.isProcessing) return;
    
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
      moves: 0
    });
  }, [initializeBoard]);

  // Initialize game on mount
  useEffect(() => {
    setGameState(prev => ({ ...prev, board: initializeBoard() }));
  }, [initializeBoard]);

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
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-magic bg-clip-text text-transparent mb-4">
            🧪 Emoji Alchemy 🧪
          </h1>
          <p className="text-foreground/80 text-lg">
            Match 3+ emojis to create magical reactions!
          </p>
        </div>

        {/* Game Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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

          <Card className="bg-card/90 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-center">Controls</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                onClick={resetGame} 
                variant="outline" 
                size="sm" 
                className="w-full"
                disabled={gameState.isProcessing}
              >
                New Game
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Game Board */}
        <Card className="bg-game-board/90 backdrop-blur-sm p-6 mb-6">
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
        </Card>

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
                <h4 className="font-semibold mb-2">Alchemy Magic:</h4>
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