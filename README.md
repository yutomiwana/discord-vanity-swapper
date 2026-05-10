# Discord Vanity Swapper

An ultra fast discord vanity URL swapper for instantly swapping a VANITY URL from one server to another without getting sniped 

> note : it Utilizes  internal discord documents for swapping instantly unlike traditional swappers, getting 100% successful swap

## Features

- marks a source server for vanity URL removal
- Attempts to claim the vanity on a target server
- BYPASSES MFA authentication
- Ultra fast with dynamically generated device spoofing
- Can be used in main account due to accurate device spoofing
- Can be swapped from anywhere 

## Requirements

- Node.js 18+
- Windows 
- Discord account with permission to manage vanity URLs
- Source and target servers eligible for vanity URLs

## Installation

```bash
git clone https://github.com/yutomiwana/discord-vanity-swapper
cd discord-vanity-swapper
npm install
```
## Update ``config.json``
```bash
{
  "token": "your_discord_token",
  "password": "your_account_password"
}
```

## Usage
```bash
node swap.js <source_server_id> <target_server_id> <desired_vanity>
```
Example:
```bash
node swap.js 123456789012345678 987654321098765432 myvanity
```