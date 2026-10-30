import { createAvatarDataUri } from './avatar.js';

function studyYearLabel(value) {
  const map = {
    'first-year': 'First year',
    'second-year': 'Second year',
    'third-year': 'Third year',
    'fourth-year': 'Fourth year',
    passed: 'Passed out',
  };
  return map[value] || value || '';
}

function safeRoundRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function renderExplainerCardCanvas({ explainer, question, dateKey }) {
  if (!explainer) throw new Error('No explainer selected.');
  const width = 1200;
  const height = 675; // Standard 16:9 social share graphic
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#06131f');
  bgGrad.addColorStop(0.5, '#0a1c2d');
  bgGrad.addColorStop(1, '#050f19');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle decorative atmospheric caustics
  ctx.save();
  const glowGrad = ctx.createRadialGradient(width * 0.85, height * 0.15, 20, width * 0.85, height * 0.15, 450);
  glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.18)');
  glowGrad.addColorStop(0.6, 'rgba(14, 165, 233, 0.05)');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  const glowBottom = ctx.createRadialGradient(width * 0.15, height * 0.85, 20, width * 0.15, height * 0.85, 380);
  glowBottom.addColorStop(0, 'rgba(45, 212, 191, 0.14)');
  glowBottom.addColorStop(1, 'transparent');
  ctx.fillStyle = glowBottom;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Outer framing border
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 2;
  safeRoundRect(ctx, 24, 24, width - 48, height - 48, 20);
  ctx.stroke();
  ctx.restore();

  // 2. Header Area
  ctx.save();
  // Eyebrow badge
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 13px "Space Grotesk", -apple-system, sans-serif';
  ctx.fillText('ABES TECHNOVATION CLUB  ·  DSAVATION', 60, 68);

  // Main Heading
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Space Grotesk", -apple-system, sans-serif';
  ctx.fillText('TODAY\'S SOLUTION EXPLAINER', 60, 108);

  // Date Tag Pill (Right side of header)
  const dateStr = dateKey || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata' }).format(new Date());
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  safeRoundRect(ctx, width - 240, 60, 180, 36, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#bae6fd';
  ctx.font = '600 14px "DM Sans", -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📅 ${dateStr}`, width - 150, 83);
  ctx.textAlign = 'left';
  ctx.restore();

  // 3. Today's Question Card
  ctx.save();
  const qY = 132;
  const qHeight = 90;
  ctx.fillStyle = 'rgba(12, 28, 42, 0.85)';
  safeRoundRect(ctx, 60, qY, width - 120, qHeight, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 62, 90, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#7dd3fc';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText('QUESTION OF THE DAY', 84, qY + 30);

  const qId = question?.id || explainer.questionId || '—';
  const qTitle = question?.title || explainer.questionTitle || 'Curriculum Problem';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px "Space Grotesk", -apple-system, sans-serif';
  ctx.fillText(`LC #${qId} · ${qTitle}`, 84, qY + 62);

  if (question?.difficulty) {
    const diff = question.difficulty;
    const diffColor = diff.toLowerCase() === 'easy' ? '#10b981' : diff.toLowerCase() === 'medium' ? '#f59e0b' : '#ef4444';
    ctx.fillStyle = `${diffColor}22`;
    safeRoundRect(ctx, width - 200, qY + 28, 100, 32, 16);
    ctx.fill();
    ctx.strokeStyle = diffColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = diffColor;
    ctx.font = '700 13px "Space Grotesk", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(diff.toUpperCase(), width - 150, qY + 49);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // 4. Hero Explainer Spotlight Section
  ctx.save();
  const sY = 240;
  const sHeight = 310;
  const spotlightGrad = ctx.createLinearGradient(60, sY, width - 60, sY + sHeight);
  spotlightGrad.addColorStop(0, 'rgba(15, 38, 58, 0.9)');
  spotlightGrad.addColorStop(1, 'rgba(9, 24, 38, 0.95)');
  ctx.fillStyle = spotlightGrad;
  safeRoundRect(ctx, 60, sY, width - 120, sHeight, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hero Avatar
  const avatarCenterX = 180;
  const avatarCenterY = sY + 145;
  const avatarR = 75;

  let avatarDrawn = false;
  try {
    const dataUri = await createAvatarDataUri(explainer.avatarStyle, explainer.avatarSeed);
    if (dataUri) {
      await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarCenterX, avatarCenterY, avatarR, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, avatarCenterX - avatarR, avatarCenterY - avatarR, avatarR * 2, avatarR * 2);
          ctx.restore();
          avatarDrawn = true;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUri;
        setTimeout(resolve, 600); // 600ms timeout max
      });
    }
  } catch {}

  if (!avatarDrawn) {
    ctx.save();
    const avBg = ctx.createLinearGradient(avatarCenterX - avatarR, avatarCenterY - avatarR, avatarCenterX + avatarR, avatarCenterY + avatarR);
    avBg.addColorStop(0, '#0284c7');
    avBg.addColorStop(1, '#0d9488');
    ctx.fillStyle = avBg;
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    const initial = (explainer.name || 'M')[0].toUpperCase();
    ctx.fillText(initial, avatarCenterX, avatarCenterY + 14);
    ctx.restore();
  }

  // Neon Avatar Ring
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Explainer Details (Right side of avatar)
  const textX = 295;
  ctx.save();

  // Spotlight Tag Badge
  ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
  safeRoundRect(ctx, textX, sY + 36, 260, 28, 14);
  ctx.fill();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#fb923c';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText('🎉 SELECTED SOLUTION EXPLAINER', textX + 16, sY + 54);

  // Full Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 34px "Space Grotesk", -apple-system, sans-serif';
  ctx.fillText(explainer.name || 'Member', textX, sY + 104);

  // Department and Study Year
  const yearText = studyYearLabel(explainer.studyYear);
  const deptYear = [explainer.department || 'Club Member', yearText].filter(Boolean).join('  ·  ');
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 17px "DM Sans", -apple-system, sans-serif';
  ctx.fillText(deptYear, textX, sY + 138);

  // Social Handles Row
  let handleX = textX;
  if (explainer.githubUsername) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    safeRoundRect(ctx, handleX, sY + 162, 175, 34, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(`GitHub: @${explainer.githubUsername}`, handleX + 12, sY + 184);
    handleX += 190;
  }
  if (explainer.leetcodeUsername) {
    ctx.fillStyle = 'rgba(251, 146, 60, 0.1)';
    safeRoundRect(ctx, handleX, sY + 162, 185, 34, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.3)';
    ctx.stroke();
    ctx.fillStyle = '#fb923c';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(`LeetCode: @${explainer.leetcodeUsername}`, handleX + 12, sY + 184);
  }

  // Submission Status
  const subTimeStr = explainer.submittedAt ? new Date(explainer.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
  ctx.fillStyle = '#34d399';
  ctx.font = '600 14px "DM Sans", -apple-system, sans-serif';
  ctx.fillText(`✓ Solution Attempt Accepted · Submitted at ${subTimeStr} IST`, textX, sY + 234);

  // Group instructions note
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'italic 13px "DM Sans", -apple-system, sans-serif';
  ctx.fillText('Please share your code walkthrough, approach and complexity insights in today\'s club session!', textX, sY + 266);
  ctx.restore();

  // 5. Footer Bar
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  safeRoundRect(ctx, 60, height - 85, width - 120, 42, 10);
  ctx.fill();
  ctx.fillStyle = '#64748b';
  ctx.font = '500 13px "Space Grotesk", -apple-system, sans-serif';
  ctx.fillText('DSAvation  ·  ABES Engineering College  ·  Technovation Club', 84, height - 59);
  ctx.textAlign = 'right';
  ctx.fillText('Randomly selected among today\'s submitters', width - 84, height - 59);
  ctx.restore();

  return canvas;
}

export async function downloadExplainerImage(params) {
  const canvas = await renderExplainerCardCanvas(params);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cleanName = (params.explainer?.name || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.href = url;
      a.download = `explainer-spotlight-${cleanName}-${params.dateKey || 'today'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve(true);
    }, 'image/png');
  });
}

export async function copyExplainerImage(params) {
  const canvas = await renderExplainerCardCanvas(params);
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          resolve('copied');
          return;
        }
      } catch (err) {
        console.warn('Clipboard write not allowed, falling back to download:', err);
      }
      // Fallback: trigger download if clipboard API unavailable
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cleanName = (params.explainer?.name || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.href = url;
      a.download = `explainer-spotlight-${cleanName}-${params.dateKey || 'today'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve('downloaded');
    }, 'image/png');
  });
}
