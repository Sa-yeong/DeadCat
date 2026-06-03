import { seedIndices } from './indices.seed';
import { seedStocks } from './stocks.seed';

async function main() {
    console.log('Seeding started...');

    await seedStocks();
    await seedIndices();

    console.log('Seeding completed!');
}

main().catch((e) => {
    console.log(e);
    process.exit(1);
});
