import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

interface TamagotchiProps {
  mood: 'happy' | 'neutral' | 'excited';
  score: number;
  customization?: {
    head: 'arteta' | 'dyche' | 'ferguson';
    body: 'suit' | 'tracksuit';
  };
}

export default function Tamagotchi({ 
  mood, 
  score, 
  customization = { head: 'arteta', body: 'suit' } 
}: TamagotchiProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  // Start animation when mood changes to excited
  useEffect(() => {
    if (mood === 'excited') {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [mood]);

  // Periodic animation
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIsAnimating(false);
      }, 3000);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const getHeadSpritePath = () => {
    return `/Managers/Previews/Heads/${customization.head}.png`;
  };

  const getBodySpritePath = () => {
    return `/Managers/Previews/Bodies/${customization.body}.png`;
  };

  const getSpriteStyle = (isHead: boolean): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      imageRendering: 'pixelated' as const,
      position: 'absolute',
      inset: 0,
      backgroundSize: '100%',
      backgroundImage: `url(${isHead ? getHeadSpritePath() : getBodySpritePath()})`,
      backgroundPosition: isHead && isAnimating ? 'bottom' : 'top'
    };

    return baseStyle;
  };

  return (
    <div className="pixel-art relative w-full h-64 overflow-hidden">
      {/* Background */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'url(/Managers/backgrounds/dugout.png)',
          backgroundSize: '100% 100%',
          imageRendering: 'pixelated'
        }}
      />
      
      <div className="absolute left-1/2 -translate-x-1/2 bottom-8">
        {/* Character */}
        <div className="relative">
          <div className="relative w-16 h-32">
            {/* Body sprite */}
            <div className="absolute bottom-0 left-0 w-16 h-16">
              <div style={getSpriteStyle(false)} />
            </div>
            {/* Head sprite */}
            <div className="absolute top-0 left-0 w-16 h-16">
              <div 
                style={getSpriteStyle(true)}
                className={classNames(
                  { 'animate-head': isAnimating }
                )}
              />
            </div>
          </div>

          {/* Shadow */}
          <div className="w-16 h-2 bg-[#8A957A] mx-auto mt-1 rounded-full blur-sm opacity-50" />
        </div>
      </div>
    </div>
  );
}