import pino from 'pino'

const pinoConfig = {
  formatters: {
    level: (label: string) => {
      return {
        level: label,
      }
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  browser: {
    asObject: true,
  },
}

const logger = pino(pinoConfig,)

type Option = {
  status?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export const loggerError = (message: string, option: Option | Error) => {
  return logger.error(option, message)
}

export const loggerWarn = (message: string, option: Option) => {
  return logger.warn(option, message)
}

export const loggerInfo = (message: string, option: Option) => {
  return logger.info(option, message)
}

export const loggerDebug = (message: string, option: Option) => {
  return logger.debug(option, message)
}
