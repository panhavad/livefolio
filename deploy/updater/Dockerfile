FROM docker:29-cli

# docker:cli already ships git and the compose plugin.
RUN apk add --no-cache su-exec

# Run the script from the mounted checkout so updater changes deploy themselves too.
ENTRYPOINT ["sh", "-c", "cp /repo/deploy/updater/update.sh /tmp/livefolio-update.sh && exec sh /tmp/livefolio-update.sh"]
