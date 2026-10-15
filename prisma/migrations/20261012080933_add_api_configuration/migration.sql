-- CreateTable
CREATE TABLE `Api` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `spreadsheetId` VARCHAR(256) NOT NULL,
    `worksheetId` INTEGER NOT NULL,
    `worksheetName` VARCHAR(200) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Api_slug_key`(`slug`),
    INDEX `Api_userId_idx`(`userId`),
    INDEX `Api_userId_spreadsheetId_idx`(`userId`, `spreadsheetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Api` ADD CONSTRAINT `Api_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
