import { useState, useEffect } from 'react';
import Image from 'next/image';

interface TamagotchiSpriteProps {
  mood: 'happy' | 'neutral' | 'excited';
  spriteSet: number;
}

export default function TamagotchiSprite({ mood, spriteSet }: TamagotchiSpriteProps) {
  const [currentSprite, setCurrentSprite] = useState('idle');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (mood === 'excited') {
      setCurrentSprite('walk');
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setCurrentSprite('idle');
        setIsAnimating(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  const getSpritePath = () => {
    const baseSprite = isAnimating ? 'walk' : 'idle';
    return `/${baseSprite}.png`;
  };

  return (
    <div className="relative w-16 h-16">
      <Image
        src={getSpritePath()}
        alt="Tamagotchi character"
        width={64}
        height={64}
        className={`pixel-art ${isAnimating ? 'animate-bounce' : ''}`}
      />
    </div>
  );
} 