// Time parsing utilities for task estimation

/**
 * Parse time string to minutes (e.g., "2d", "2h", "30m", "2d3h5m2s", "45s")
 */
export function parseTimeString(timeStr: string): number | undefined {
  // Match patterns like "2d3h5m2s", "1h2m34s", "2h30m", "45s"
  const pattern = /^(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i;
  const match = timeStr.trim().match(pattern);
  
  if (match && match[0].trim()) {
    const days = match[1] ? parseFloat(match[1]) : 0;
    const hours = match[2] ? parseFloat(match[2]) : 0;
    const minutes = match[3] ? parseFloat(match[3]) : 0;
    const seconds = match[4] ? parseFloat(match[4]) : 0;
    
    // Validate numbers are finite and positive
    if (!isFinite(days) || !isFinite(hours) || !isFinite(minutes) || !isFinite(seconds) || 
        days < 0 || hours < 0 || minutes < 0 || seconds < 0) {
      return undefined;
    }
    
    // Calculate total minutes (including fractional minutes from seconds)
    const totalMinutes = days * 1440 + hours * 60 + minutes + seconds / 60;
    
    // Validate result is reasonable (not too large, not zero)
    if (totalMinutes > 0 && totalMinutes < 144000) { // Max 100 days
      return totalMinutes;
    }
  }
  
  return undefined;
}

/**
 * Parse time estimation from task content (e.g., "2d", "2h", "30m", "2d3h5m2s", "45s")
 * Returns clean content and parsed estimated minutes
 */
export function parseTimeEstimation(content: string): { cleanContent: string; estimatedMinutes?: number } {
  // Match complex patterns like "2d3h5m2s", "1h2m34s", "2h30m", "45s" at the end of content
  const complexPattern = /\s+(?:(\d+(?:\.\d+)?)d)?(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i;
  const match = content.match(complexPattern);
  
  if (match && match[0].trim()) {
    const timeStr = match[0].trim();
    const estimatedMinutes = parseTimeString(timeStr);
    
    if (estimatedMinutes !== undefined) {
      const cleanContent = content.replace(match[0], '').trim();
      // Don't allow empty content after removing time
      if (cleanContent.length === 0) {
        return { cleanContent: content };
      }
      return { cleanContent, estimatedMinutes };
    }
  }
  
  return { cleanContent: content };
}
