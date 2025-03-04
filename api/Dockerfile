FROM ubuntu:20.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js 18.x and other dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ffmpeg \
    gcc \
    git \
    libsdl2-2.0-0 \
    make \
    meson \
    ninja-build \
    pkg-config \
    libavcodec-dev \
    libavdevice-dev \
    libavformat-dev \
    libavutil-dev \
    libsdl2-dev \
    libswresample-dev \
    libusb-1.0-0 \
    libusb-1.0-0-dev \
    wget \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y \
    nodejs \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install scrcpy
RUN git clone https://github.com/Genymobile/scrcpy \
    && cd scrcpy \
    && sed -i 's/sudo //g' install_release.sh \ 
    && ./install_release.sh \
    && cd .. \
    && rm -rf scrcpy

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install pnpm
RUN npm i -g pnpm

# Install dependencies
RUN pnpm install

# Copy platform-tools (ADB)
COPY platform-tools /usr/local/platform-tools

# Add platform-tools to PATH
RUN echo 'export PATH=$PATH:/usr/local/platform-tools' >> ~/.bashrc \
    && /bin/bash -c "source ~/.bashrc"

# Add platform-tools to system-wide PATH
ENV PATH="/usr/local/platform-tools:${PATH}"

# Copy rest of the application
COPY . .

RUN pnpm run build

EXPOSE 3005
ENV MONGO_URI=mongodb://172.17.0.3:27017/
ENV JWT_SECRET=secret
ENV JWT_EXPIRATION=60d

ENV FIREBASE_PROJECT_ID="textb-f526f"
ENV FIREBASE_PRIVATE_KEY_ID="078aa1d206633addf22838ab5e4512cc94fc97ff"
ENV FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCU6GdXtrSnX4vI\nWn+jC8bvJD3uTP4phexpCjc4QBrOs75Sn/CEP2Sk2L/CFQEw6Ul0KqcLtK5Y5gCx\nHR25SPmOhso+SwiW9cNkDTP+rhVg64BruBXxH6V0Bae1BtjOnBE01fh8T1usQ/ri\nfSNQ1udpSoyyMJS2dWGKTfQzeEub3obNLPhCKZWwR/00WB+wKiuv+SsMrkrZvAvN\n3Af+0xpM9v2wCp+H09r9/EwFBjDQIJ7edin2YGAcUAWetf6++w1xhSSHRd2ZQEfU\nZp2v1C2biyd00Wf622neBSXQrAJaHuiAHIRXKvA7ncvgc/mhfbiMvwwYpjCTlJuX\nrXaeBQSNAgMBAAECggEAAWs6M23eEZbr3rsa4XSpPJDj8lI8j1DxQg7TCjsi/2Xb\nRF1aIpfjCt1/tflAekK5qA8IIIQ/nS6YJwWZCYPS9TV1g83wAvrMcUkB69wk/6W9\nrA2o9CYdgrocWnGe3XRDdP52O7VIld8EYcpz0Sh7oaUHPaxreTG+NMugSYVoKr22\nBhHESOG6K+eVCmcpA51TTbwdT2j6db8M3LUzhdQje5AL0rEdi+BSpkHwA8ZsvQXG\nXwHpBOBL87uW3H42KX7bMiIFntGwnd3sZvZfGMbZYEB1ma4/+NKjsTZCwvoV/58H\nvJPrr6IEyMdNlF1JKMW3veKpUzSnBxCjAaxYPRp3wQKBgQDNupZXp8VG47uGzB3H\noFG3y+6vDO8t+XmVjIkwVJfHti4sK2WvArnlTVP0hZe+SHqFlf1SxDAwGs/cfLQ5\nArnHNuPH2BOqtdWkQgt4PkNWUlCZfznUv2WyaK9WguWTUzwatFMklE7u7BJWn6sK\naOr0TBe9Z/vRLX8FHhCfc6+zzQKBgQC5S11d/5JckPFzPHEbQwYBZt0X1DthoGBQ\njQz/Y4HtHeGBnJ9WOHb+Vttx3fq0LEhlLx2K16KepsCswIaXdS3xW+D9swlgWuLk\nrwN+sZWUpGhtXo6gGe4Pe63uTdouFPG8z92Wd71drUVMIXbU/VPClcmVdhD8Bzc3\n6angv09TwQKBgFxzTBqKB0pLDruNwJg0AGUTHOjHbDiB0tSUuhXg/fA+e1NYETLr\ni7Ry4paQ7lcRZRXhCF0IUwtbESvpUmgIRIo0rXniLTxayG4vS842VLZW+WdxWAC2\nHjJlft3mptpk3i61+GMIzsvphHgu+oMMEQHFrClusCgZROp8z0WIjF3FAoGBAJCr\n4CVBIyR04p/npCP1651yk9NEGGz8C9c4mdpY9huNhgFtqRZnlbi1VjcMau772DZw\nV++Mt2KJrcvzseJVUl6tLvjGLd72d0q3vtHPk4tv5jzmZBNqy215Um7KiDwMjEWw\nQkF2EfsvCvkK874OYLR/wNmaSl6Mv7c/ECzzEdvBAoGACyl6Tkua37+fGT44blSR\nrV2eu5Uzrvmko9kOsKuhkB+y/XswY4v7nYivtOxABQ8BDn9ZqcCS0nRdwljS0Zki\nG1TeTEv50W6DNkdNR3VXo6l/+gOLdCIDiCyes9a5RAjL8u1Hg9sh6aMeJrqvShM0\nfKyvFoDOIwpDcu/iF+Cy6/g=\n-----END PRIVATE KEY-----\n"
ENV FIREBASE_CLIENT_EMAIL="firebase-adminsdk-s4oxs@textb-f526f.iam.gserviceaccount.com"
ENV FIREBASE_CLIENT_ID="113579811571694152550"
ENV FIREBASE_CLIENT_C509_CERT_URL="https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-s4oxs%40textb-f526f.iam.gserviceaccount.com"

ENV PROXY_USERNAME="xyz"
ENV PROXY_PASSWORD="abc"
ENV DISPLAY=:99
RUN Xvfb :99 &


CMD ["pnpm", "run", "start:dev"]
