import {rgbToHSL, hslToRGB, rgbToString, rgbToHexString, RGBA, HSLA} from '../utils/color';
import {scale, clamp} from '../utils/math';
import {applyColorMatrix, createFilterMatrix} from './utils/matrix';
import {FilterConfig} from '../definitions';

const colorModificationCache = new Map<Function, Map<string, string>>();

export function clearColorModificationCache() {
    colorModificationCache.clear();
}

function modifyColorWithCache(rgb: RGBA, filter: FilterConfig, modifyHSL: (hsl: HSLA) => (HSLA & {isNeutral: boolean})) {
    let fnCache: Map<string, string>;
    if (colorModificationCache.has(modifyHSL)) {
        fnCache = colorModificationCache.get(modifyHSL);
    } else {
        fnCache = new Map();
        colorModificationCache.set(modifyHSL, fnCache);
    }
    const id = Object.entries(rgb)
        .concat(Object.entries(filter).filter(([key]) => ['mode', 'brightness', 'contrast', 'grayscale', 'sepia'].indexOf(key) >= 0))
        .map(([key, value]) => `${key}:${value}`)
        .join(';');
    if (fnCache.has(id)) {
        return fnCache.get(id);
    }

    const hsl = rgbToHSL(rgb);
    const modified = modifyHSL(hsl);
    const {r, g, b, a} = hslToRGB(modified);
    const matrix = createFilterMatrix({...filter, ...(modified.isNeutral ? {} : {sepia: filter.sepia / 3, grayscale: filter.grayscale / 3}), mode: 0})
    const [rf, gf, bf] = applyColorMatrix([r, g, b], matrix);

    const color = (a === 1 ?
        rgbToHexString({r: rf, g: gf, b: bf}) :
        rgbToString({r: rf, g: gf, b: bf, a}));

    fnCache.set(id, color);
    return color;
}

function modifyLightModeHSL({h, s, l, a}) {
    const lMin = 0;
    const lMid = 0.4;
    const lMax = 0.9;
    const sNeutralLim = 0.36;
    const sColored = 0.16;
    const hColoredL0 = 220;
    const hColoredL1 = 40;

    const lx = scale(l, 0, 1, lMin, lMax);

    let hx = h;
    let sx = s;
    const isNeutral = s < sNeutralLim;
    if (isNeutral) {
        sx = (l < lMid ?
            scale(l, 0, lMid, sColored, 0) :
            scale(l, lMid, 1, 0, sColored));
        hx = (l < lMid ? hColoredL0 : hColoredL1);
    }

    return {h: hx, s: sx, l: lx, a, isNeutral};
}

function modifyBgHSL({h, s, l, a}) {
    const lMin = 0.1;
    const lMaxS0 = 0.25;
    const lMaxS1 = 0.4;
    const sNeutralLimL0 = 0.24;
    const sNeutralLimL1 = 0.12;
    const sColoredL0 = 0.08;
    const sColoredL1 = 0.24;
    const hColoredL0 = 225;
    const hColoredL1 = 215;

    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = (l < lMax ?
        l :
        l < 0.5 ?
            lMax :
            scale(l, 0.5, 1, lMax, lMin));

    const sNeutralLim = scale(clamp(lx, lMin, lMax), lMin, lMax, sNeutralLimL0, sNeutralLimL1);
    const isNeutral = s < sNeutralLim;
    let hx = h;
    let sx = s;
    if (isNeutral) {
        sx = scale(clamp(lx, lMin, lMax), lMin, lMax, sColoredL0, sColoredL1);
        hx = scale(clamp(lx, lMin, lMax), lMin, lMax, hColoredL0, hColoredL1);
    }

    return {h: hx, s: sx, l: lx, a, isNeutral};
}

export function modifyBackgroundColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBgHSL);
}

function modifyFgHSL({h, s, l, a}) {
    const lMax = 0.9;
    const lMinS0 = 0.7;
    const lMinS1 = 0.6;
    const sNeutralLimL0 = 0.12;
    const sNeutralLimL1 = 0.36;
    const sColored = 0.08;
    const hColoredL0 = 35;
    const hColoredL1 = 45;
    const hBlue0 = 205;
    const hBlue1 = 245;
    const hBlueMax = 220;
    const lBlueMin = 0.7;

    const isBlue = h > hBlue0 && h <= hBlue1;

    const lMin = scale(s, 0, 1, isBlue ? scale(h, hBlue0, hBlue1, lMinS0, lBlueMin) : lMinS0, lMinS1);
    const lx = (l < 0.5 ?
        scale(l, 0, 0.5, lMax, lMin) :
        l < lMin ?
            lMin :
            l);
    let hx = h;
    let sx = s;
    if (isBlue) {
        hx = scale(hx, hBlue0, hBlue1, hBlue0, hBlueMax);
    }
    const sNeutralLim = scale(clamp(lx, lMin, lMax), lMin, lMax, sNeutralLimL0, sNeutralLimL1);
    const isNeutral = s < sNeutralLim;
    if (isNeutral) {
        sx = sColored;
        hx = scale(clamp(lx, lMin, lMax), lMin, lMax, hColoredL0, hColoredL1);
    }

    return {h: hx, s: sx, l: lx, a, isNeutral};
}

export function modifyForegroundColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyFgHSL);
}

function modifyBorderHSL({h, s, l, a}) {
    const lMinS0 = 0.2;
    const lMinS1 = 0.3;
    const lMaxS0 = 0.4;
    const lMaxS1 = 0.5;

    const lMin = scale(s, 0, 1, lMinS0, lMinS1);
    const lMax = scale(s, 0, 1, lMaxS0, lMaxS1);
    const lx = scale(l, 0, 1, lMax, lMin);

    return {h, s, l: lx, a, isNeutral: true};
}

export function modifyBorderColor(rgb: RGBA, filter: FilterConfig) {
    if (filter.mode === 0) {
        return modifyColorWithCache(rgb, filter, modifyLightModeHSL);
    }
    return modifyColorWithCache(rgb, filter, modifyBorderHSL);
}

export function modifyShadowColor(rgb: RGBA, filter: FilterConfig) {
    return modifyBackgroundColor(rgb, filter);
}

export function modifyGradientColor(rgb: RGBA, filter: FilterConfig) {
    return modifyBackgroundColor(rgb, filter);
}
