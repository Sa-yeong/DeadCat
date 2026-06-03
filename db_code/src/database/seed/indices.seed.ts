import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export async function seedIndices() {
    const indices = [
        {
            name: '나스닥',
            name_en: 'NASDAQ',
            code: '^IXIC',
        },
        {
            name: '코스피',
            name_en: 'KOSPI',
            code: '^KS11',
        },
        {
            name: '코스닥',
            name_en: 'KOSDAQ',
            code: '^KQ11',
        },
        {
            name: 'S&P 500',
            name_en: 'S&P 500',
            code: '^GSPC',
        },
        {
            name: '다우 존스',
            name_en: 'DOW JONES',
            code: '^DJI',
        },
    ];

    await prisma.indices.createMany({
        data: indices,
        skipDuplicates: true,
    });

    console.log(`Indices seeded: ${indices.length} rows!`);
}
