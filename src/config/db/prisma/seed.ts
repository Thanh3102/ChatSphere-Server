import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();

const users = [
  { name: 'John Doe', email: 'john.doe@example.com', password: 'password123' },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    password: 'password123',
  },
  {
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    password: 'password123',
  },
  {
    name: 'Bob Brown',
    email: 'bob.brown@example.com',
    password: 'password123',
  },
  {
    name: 'Eve White',
    email: 'eve.white@example.com',
    password: 'password123',
  },
  {
    name: 'Michael Clark',
    email: 'michael.clark@example.com',
    password: 'password123',
  },
  {
    name: 'Sara Davis',
    email: 'sara.davis@example.com',
    password: 'password123',
  },
  {
    name: 'David Lee',
    email: 'david.lee@example.com',
    password: 'password123',
  },
  {
    name: 'Anna Martinez',
    email: 'anna.martinez@example.com',
    password: 'password123',
  },
  {
    name: 'Kevin Wilson',
    email: 'kevin.wilson@example.com',
    password: 'password123',
  },
];

async function main() {
  await prisma.$transaction(async (p) => {
    for (const user of users) {
      await p.user.create({
        data: {
          name: user.name,
          email: user.email,
          password: await bcrypt.hashSync(user.password, 10),
          image: null,
          verifyEmail: true,
        },
      });
    }
  });
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
