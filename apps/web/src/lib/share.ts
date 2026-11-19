export const inviteUrl = (origin: string, token: string) => `${origin}/invite/${token}`;
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
