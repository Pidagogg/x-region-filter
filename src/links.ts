// Where links out of the extension go. The W flow link says only where it came
// from (utm_content: which screen) and nothing else: no ids, nothing about the user.

export const promoLink = (place: string) => `https://w-flow.tech/?utm_source=x-region-filter&utm_medium=extension&utm_content=${place}`;
