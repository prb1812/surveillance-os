import { PrismaClient, Role, Plan, CameraStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('Password123!', 10);

  // 1. Super Admin
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@surveillanceos.com' },
    update: {},
    create: {
      email: 'admin@surveillanceos.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // 2. Clients
  const clientA = await prisma.client.upsert({
    where: { email: 'contact@acmecorp.com' },
    update: {},
    create: {
      name: 'Acme Corporation',
      email: 'contact@acmecorp.com',
      phone: '+1234567890',
      plan: Plan.STANDARD,
    },
  });

  const clientB = await prisma.client.upsert({
    where: { email: 'contact@globex.com' },
    update: {},
    create: {
      name: 'Globex Industries',
      email: 'contact@globex.com',
      phone: '+0987654321',
      plan: Plan.PREMIUM,
    },
  });
  console.log('✅ Clients created:', clientA.name, clientB.name);

  // 3. Customer users
  await prisma.user.upsert({
    where: { email: 'owner@acmecorp.com' },
    update: {},
    create: {
      email: 'owner@acmecorp.com',
      password: hashedPassword,
      name: 'Acme Owner',
      role: Role.CUSTOMER,
      clientId: clientA.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'owner@globex.com' },
    update: {},
    create: {
      email: 'owner@globex.com',
      password: hashedPassword,
      name: 'Globex Owner',
      role: Role.CUSTOMER,
      clientId: clientB.id,
    },
  });

  // 4. Operators
  const operator1 = await prisma.user.upsert({
    where: { email: 'operator1@surveillanceos.com' },
    update: {},
    create: {
      email: 'operator1@surveillanceos.com',
      password: hashedPassword,
      name: 'John Operator',
      role: Role.OPERATOR,
    },
  });

  const operator2 = await prisma.user.upsert({
    where: { email: 'operator2@surveillanceos.com' },
    update: {},
    create: {
      email: 'operator2@surveillanceos.com',
      password: hashedPassword,
      name: 'Jane Operator',
      role: Role.OPERATOR,
    },
  });
  console.log('✅ Operators created');

  // 5. Cameras
  const cameraA1 = await prisma.camera.create({
    data: {
      name: 'Acme - Front Entrance',
      location: 'Main building front door',
      rtspUrl: 'rtsp://192.168.1.100:554/stream1',
      status: CameraStatus.OFFLINE,
      clientId: clientA.id,
    },
  });

  const cameraA2 = await prisma.camera.create({
    data: {
      name: 'Acme - Parking Lot',
      location: 'North parking area',
      rtspUrl: 'rtsp://192.168.1.101:554/stream1',
      status: CameraStatus.OFFLINE,
      clientId: clientA.id,
    },
  });

  const cameraB1 = await prisma.camera.create({
    data: {
      name: 'Globex - Warehouse Gate',
      location: 'Warehouse main gate',
      rtspUrl: 'rtsp://10.0.1.50:554/stream1',
      status: CameraStatus.OFFLINE,
      clientId: clientB.id,
    },
  });

  const cameraB2 = await prisma.camera.create({
    data: {
      name: 'Globex - Server Room',
      location: 'IT department server room',
      rtspUrl: 'rtsp://10.0.1.51:554/stream1',
      status: CameraStatus.OFFLINE,
      clientId: clientB.id,
    },
  });
  console.log('✅ Cameras created');

  // 6. Camera assignments
  await prisma.cameraAssignment.createMany({
    data: [
      { cameraId: cameraA1.id, operatorId: operator1.id },
      { cameraId: cameraA2.id, operatorId: operator1.id },
      { cameraId: cameraB1.id, operatorId: operator2.id },
      { cameraId: cameraB2.id, operatorId: operator2.id },
    ],
    skipDuplicates: true,
  });
  console.log('✅ Camera assignments created');

  console.log('\n🎉 Seed complete! Test credentials:');
  console.log('Super Admin: admin@surveillanceos.com / Password123!');
  console.log('Operator 1:  operator1@surveillanceos.com / Password123!');
  console.log('Operator 2:  operator2@surveillanceos.com / Password123!');
  console.log('Customer A:  owner@acmecorp.com / Password123!');
  console.log('Customer B:  owner@globex.com / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });