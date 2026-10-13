#!/bin/sh
# First-time setup for the one OVH VPS. Run it on that server as root.
# Do not run it on a developer machine.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root on the VPS." >&2
  exit 1
fi

if [ ! -s /root/.ssh/authorized_keys ] && [ ! -s /home/*/.ssh/authorized_keys ]; then
  echo "Add an SSH public key before turning off password login." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 ufw unattended-upgrades ca-certificates

systemctl enable --now docker
systemctl enable --now unattended-upgrades

mem_kb=$(awk '/MemTotal/ { print $2 }' /proc/meminfo)
if [ "$mem_kb" -lt 2500000 ] && [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

sshd_config=/etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' "$sshd_config"
sed -i 's/^#\?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' "$sshd_config"
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' "$sshd_config"
systemctl reload ssh || systemctl reload sshd

mkdir -p /opt/ulixdesk/env /opt/ulixdesk/docker/backup /opt/ulixdesk/docker/postgres /opt/ulixdesk/scripts
echo "Docker, the firewall, unattended upgrades, and SSH keys are in place."
echo "Next: copy the compose files, create the env files, and log Docker into ghcr.io. See docs/DEPLOY.md."
