import React from 'react';

const LoadingSpinner = ({
  size = 'medium',
  text = 'Loading...',
  type = 'dots',
  fullScreen = false
}) => {
  const sizeClasses = {
    small: 'w-6 h-6',
    medium: 'w-12 h-12',
    large: 'w-16 h-16'
  };

  const textSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg'
  };

  const containerClass = fullScreen
    ? 'fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50'
    : 'flex flex-col items-center justify-center p-8';

  if (type === 'dots') {
    return (
      <div className={containerClass}>
        <div className="flex space-x-2">
          <div
            className={`${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce`}
            style={{ animationDelay: '0ms' }}
          />
          <div
            className={`${sizeClasses[size]} bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-bounce`}
            style={{ animationDelay: '150ms' }}
          />
          <div
            className={`${sizeClasses[size]} bg-gradient-to-r from-pink-500 to-red-500 rounded-full animate-bounce`}
            style={{ animationDelay: '300ms' }}
          />
        </div>
        {text && (
          <p className={`mt-4 ${textSizeClasses[size]} text-gray-600 dark:text-gray-300 font-medium animate-pulse`}>
            {text}
          </p>
        )}
      </div>
    );
  }

  if (type === 'pulse') {
    return (
      <div className={containerClass}>
        <div className={`${sizeClasses[size]} relative`}>
          <div className={`${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-ping absolute`} />
          <div className={`${sizeClasses[size]} bg-gradient-to-r from-purple-500 to-pink-500 rounded-full relative`} />
        </div>
        {text && (
          <p className={`mt-4 ${textSizeClasses[size]} text-gray-600 dark:text-gray-300 font-medium animate-pulse`}>
            {text}
          </p>
        )}
      </div>
    );
  }

  if (type === 'spinner') {
    return (
      <div className={containerClass}>
        <div className={`${sizeClasses[size]} border-4 border-gray-200 dark:border-gray-700 border-t-blue-500 dark:border-t-purple-500 rounded-full animate-spin`} />
        {text && (
          <p className={`mt-4 ${textSizeClasses[size]} text-gray-600 dark:text-gray-300 font-medium`}>
            {text}
          </p>
        )}
      </div>
    );
  }

  if (type === 'bars') {
    return (
      <div className={containerClass}>
        <div className="flex space-x-1">
          <div className="w-1 h-8 bg-gradient-to-t from-blue-500 to-purple-500 animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-12 bg-gradient-to-t from-purple-500 to-pink-500 animate-pulse" style={{ animationDelay: '200ms' }} />
          <div className="w-1 h-10 bg-gradient-to-t from-pink-500 to-red-500 animate-pulse" style={{ animationDelay: '400ms' }} />
          <div className="w-1 h-14 bg-gradient-to-t from-red-500 to-orange-500 animate-pulse" style={{ animationDelay: '600ms' }} />
          <div className="w-1 h-8 bg-gradient-to-t from-orange-500 to-yellow-500 animate-pulse" style={{ animationDelay: '800ms' }} />
        </div>
        {text && (
          <p className={`mt-4 ${textSizeClasses[size]} text-gray-600 dark:text-gray-300 font-medium animate-pulse`}>
            {text}
          </p>
        )}
      </div>
    );
  }

  if (type === 'skeleton') {
    return (
      <div className={containerClass}>
        <div className="space-y-4 w-full max-w-md">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-shimmer w-3/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-shimmer w-1/2" style={{ animationDelay: '200ms' }} />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-shimmer w-5/6" style={{ animationDelay: '400ms' }} />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-shimmer w-2/3" style={{ animationDelay: '600ms' }} />
        </div>
        {text && (
          <p className={`mt-4 ${textSizeClasses[size]} text-gray-600 dark:text-gray-300 font-medium animate-wave`}>
            {text}
          </p>
        )}
      </div>
    );
  }

  return null;
};

export default LoadingSpinner;
