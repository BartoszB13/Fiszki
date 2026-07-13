const { PrismaClient } = require('@prisma/client');

// Jeden, współdzielony klient Prisma w całej aplikacji (best practice)
const prisma = new PrismaClient();

module.exports = prisma;
