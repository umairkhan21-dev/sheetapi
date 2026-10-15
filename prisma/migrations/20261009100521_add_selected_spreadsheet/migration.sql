-- CreateTable
CREATE TABLE `SelectedSpreadsheet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `spreadsheetId` VARCHAR(256) NOT NULL,
    `name` VARCHAR(1024) NOT NULL,
    `modifiedTime` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SelectedSpreadsheet_userId_spreadsheetId_key`(`userId`, `spreadsheetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SelectedSpreadsheet` ADD CONSTRAINT `SelectedSpreadsheet_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
