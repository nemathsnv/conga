// The app's one ticket store (ticketStore.ts): Post Review starts the request for the signed-in
// member, and Post uses the same one.
import { createTicketStore } from './ticketStore';
import { mintUpload } from './upload';

export const uploadTickets = createTicketStore(() => mintUpload());
