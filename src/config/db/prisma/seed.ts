import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();

function getRandomDate(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const randomMs = Math.floor(Math.random() * (endMs - startMs + 1)) + startMs;
  return new Date(randomMs);
}

function generateRandomPhoneNumber() {
  const randomNumber = Math.floor(Math.random() * 10000000000);
  return randomNumber.toString().padStart(10, '0');
}

const users = [
  {
    name: 'John Doe',
    email: 'john.doe@example.com',
    password: 'password123',
    gender: 'Nam',
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'Bob Brown',
    email: 'bob.brown@example.com',
    password: 'password123',
    gender: 'Nam',
  },
  {
    name: 'Eve White',
    email: 'eve.white@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'Michael Clark',
    email: 'michael.clark@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'Sara Davis',
    email: 'sara.davis@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'David Lee',
    email: 'david.lee@example.com',
    password: 'password123',
    gender: 'Nam',
  },
  {
    name: 'Anna Martinez',
    email: 'anna.martinez@example.com',
    password: 'password123',
    gender: 'Nữ',
  },
  {
    name: 'Kevin Wilson',
    email: 'kevin.wilson@example.com',
    password: 'password123',
    gender: 'Nam',
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
          dateOfBirth: getRandomDate(
            new Date('1970-01-01'),
            new Date('2010-12-31'),
          ),
          gender: user.gender,
          phoneNumber: generateRandomPhoneNumber(),
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
