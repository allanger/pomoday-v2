import * as React from 'react';
import marked from 'marked';
import { useRef, useEffect } from 'react';

const StateContext = React.createContext<any>(null);

const useInterval = (callback, delay) => {
    const savedCallback = useRef();
    let handler = null;
    // Remember the latest callback.
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);
    // Set up the interval.
    useEffect(() => {
        function tick() {
          savedCallback.current();
        }
        if (delay !== 0) {
            handler = setInterval(tick, delay);
            return () => clearInterval(handler);
        }
        else {
            clearInterval(handler);
        }
    }, [delay]);
};

enum RowType {
  TAG,
  TASK,
  TEXT
};

enum TaskStatus {
  NONE,
  DONE,
  WIP,
  WAIT,
  FLAG
}

type Command = {
  command: string,
  tag?: string,
  text?: string,
  id?: number
} | null;

const parseTaskCommand = (str: string) => str.match(/^(t(?:ask)?)\s(@(?:\S*['-]?)(?:[0-9a-zA-Z'-]+))?(.*)/i);
const parseEditCommand = (str: string) => str.match(/^(e(?:dit)?)\s(\d+)(.*)/i);
const parseMoveCommand = (str: string) => str.match(/^(mv|move)\s(\d+)\s(@(?:\S*['-]?)(?:[0-9a-zA-Z'-]+))/i);
const parseCheckCommand = (str: string) => str.match(/^(c(?:heck)?)\s(\d+)/i);
const parseBeginCommand = (str: string) => str.match(/^(b(?:egin)?)\s(\d+)/i);
const parseDeleteCommand = (str: string) => str.match(/^(d(?:elete)?)\s(\d+)/i);
const parseFlagCommand = (str: string) => str.match(/^(fl(?:ag)?)\s(\d+)/i);
const parseStopCommand = (str: string) => str.match(/^(st(?:op)?)\s(\d+)/i);
const parseOtherCommand = (str: string) => str.match(/^(close-help|help|today)/i);

const parseCommand = (input: string): Command => {
  const matchTask = parseTaskCommand(input);
  if (matchTask) {
    return {
      command: matchTask[1],
      tag: matchTask[2],
      text: matchTask[3].trim()
    } as Command;
  }

  const matchEdit = parseEditCommand(input);
  if (matchEdit) {
    return {
      command: matchEdit[1],
      id: parseInt(matchEdit[2]),
      text: matchEdit[3].trim()
    } as Command;
  }

  const matchMove = parseMoveCommand(input);
  if (matchMove) {
    return {
      command: matchMove[1],
      id: parseInt(matchMove[2]),
      tag: matchMove[3]
    } as Command;
  }

  const matchOther = parseCheckCommand(input)  ||
                     parseBeginCommand(input)  ||
                     parseDeleteCommand(input) ||
                     parseFlagCommand(input)   ||
                     parseStopCommand(input);
  if (matchOther) {
    return {
      command: matchOther[1],
      id: parseInt(matchOther[2])
    }
  }

  const matchHelp = parseOtherCommand(input);
  if (matchHelp) {
    return {
      command: matchHelp[1]
    }
  }
  return null;
};

const getStatus = (status?: TaskStatus) => {
  switch (status) {
    case TaskStatus.DONE: return `<span class="text-lg text-green-600">✔</span>`;
    case TaskStatus.WIP: return `<span class="text-lg text-orange-500">*</span>`;
    case TaskStatus.WAIT: return `<span class="text-lg text-gray-500">□</span>`;
    case TaskStatus.FLAG: return `<span class="text-lg text-tomato-500">■</span>`;
    default: return "";
  }
};

type Worklog = {
  start: number;
  end: number;
};

type TaskItem = {
  id: number;
  tag: string;
  title: string;
  status: TaskStatus;
  logs: Worklog[];
};

const pad = n => n > 9 ? `${n}` : `0${n}`;
const counterAsString = (counter) => {
  const days = ~~(counter / 86400);
  const remain = counter - days * 86400;
  const hrs = ~~(remain / 3600);
  const min = ~~((remain - (hrs * 3600)) / 60);
  const sec = ~~(remain % 60);
  return `${days > 0 ? days + ' days' : ''} ${hrs > 0 ? pad(hrs) + ':' : ''}${pad(min)}:${pad(sec)}`;
};
const counterAsLog = (counter) => {
  const days = ~~(counter / 86400);
  const remain = counter - days * 86400;
  const hrs = ~~(remain / 3600);
  const min = ~~((remain - (hrs * 3600)) / 60);
  const sec = ~~(remain % 60);
  return `${days > 0 ? days + ' days ' : ''}${hrs > 0 ? pad(hrs) + ' hrs ' : ''}${min > 0 ? pad(min) + ' min ' : '' }${pad(sec) + ' sec '}`;
};

const TimeSpent = (props) => {
  const task = props.task;

  const totalTime = (task.logs || []).reduce((total, log: Worklog) => {
    if (log.end) {
      total += log.end - log.start;
    } else {
      total += Date.now() - log.start;
    }
    return total;
  }, 0) / 1000;

  const [ counter, setCounter ] = React.useState(totalTime);

  useInterval(() => {
    setCounter(counter + 1);
  }, task.status === TaskStatus.WIP ? 1000 : 0);

  switch (task.status) {
    case TaskStatus.WIP:
      return <span className="block sm:inline-block text-sm text-orange-500">{counterAsString(counter)}</span>;
    case TaskStatus.DONE:
      return <span className="block sm:inline-block text-sm text-gray-400">{counterAsString(counter)}</span>;
    default:
      return counter ? <span className="block sm:inline-block text-sm text-tomato-400">{counterAsString(counter)}</span> : null;
  }
};

const taskAsString = t => marked(t).replace('<p>', '').replace('</p>', '');

const TaskItemDisplay = props => {
  const task = props.task;
  const html = getStatus(task.status) + ' ' + taskAsString(task.title);
  return <>
    <div className="w-12 text-right mr-2">{task.id}. </div>
    <div className="flex-1 text-left">
      <span className={`task-content inline-block ${task.status === TaskStatus.DONE ? 'text-gray-500 line-through' : ''}`} dangerouslySetInnerHTML={{__html: html}}></span>
      {' '}
      <TimeSpent task={task} />
    </div>
  </>;
};

const Row = (props) => {
  const type = props.type;
  const text = props.text || "";
  const task = props.task || undefined;
  return <div className={`row ${type === RowType.TAG ? 'font-bold underline' : (type === RowType.TEXT && !text.length ? 'p-3' : 'flex flex-row')}`}>
    {type === RowType.TASK ? <TaskItemDisplay task={task} /> : ( type === RowType.TEXT ? <span className="inline-block" dangerouslySetInnerHTML={{__html: marked(text)}}></span> : text)}
  </div>;
};

const isSameDay = (a, b) => Math.abs(a - b) <= 86400000;

const Today = props => {
  const [ state ] = React.useContext(StateContext);
  const now = Date.now();
  const today = state.tasks.reduce((tasks, t) => {
    if (t.logs) {
      const works = t.logs.reduce((logs, l, id) => {
        if (l.start && isSameDay(now, l.start)) {
          logs.push({
            task: t.title,
            start: l.start,
            end: l.end,
            done: l.end && id === t.logs.length - 1 && t.status === TaskStatus.DONE || false
          });
        }
        return logs;
      }, []);
      tasks = tasks.concat(works);
    }
    return tasks;
  }, []);
  today.sort((a, b) => a.start - b.start);

  const totalTime = today.reduce((total, t) => total + ((t.end || now) - t.start), 0) / 1000;

  return <>
    <div className="font-bold text-black mb-4">Today Activities</div>
    {today.map((t, i) => <div className="text-black mb-2 flex flex-row" key={i}>
    <div className="w-8 text-right mr-2">{i + 1}.</div>
      <div className="flex-1">
        <div dangerouslySetInnerHTML={{ __html: taskAsString(t.task) }}></div>
        <div className="text-xs text-gray-500">{ (new Date(t.start)).toLocaleTimeString() } - { !t.end ? <span className="text-orange-500">ON GOING</span> : <span>{counterAsLog((t.end - t.start) / 1000)}</span> } {t.done ? [<span>- </span>, <span className="text-green-600">FINISHED</span>] : null}</div>
      </div>
    </div>)}
    <div className="text-black mt-4">Total time spent: <span className="text-tomato-500">{counterAsLog(totalTime)}</span></div>
  </>;
};

const getInitialState = () => {
  if (window.localStorage) {
    const saved = window.localStorage.getItem('pomoday');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed) {
          return parsed;
        }
      } catch {}
    }
  }
  return {
    tasks: [] as TaskItem[],
    showHelp: true,
    showToday: false
  };
};

const stopWorkLogging = (t: TaskItem) => {
  if (t.logs && t.logs.length) {
    const lastLog = t.logs[t.logs.length - 1];
    if (lastLog.start && !lastLog.end) {
      lastLog.end = Date.now();
    }
  } else {
    t.logs = [ {
      start: Date.now(),
      end: Date.now()
    } as Worklog ];
  }
  return t;
};

export const App = () => {
  const inputRef = React.useRef(null);
  const [ state, setState ] = React.useState(getInitialState());

  React.useEffect(() => {
    window.localStorage.setItem('pomoday', JSON.stringify(state));
  }, [state]);

  const onKeyPress = e => {
    if (inputRef && inputRef.current) {
      const key = e.which || e.keyCode;
      if (key === 13) {
        const cmd = parseCommand(inputRef.current.value);
        if (cmd) {
          switch (cmd.command.toLowerCase()) {
            case "mv":
            case "move":
              const mupdated = state.tasks.map(t => {
                if (t.id === cmd.id) {
                  t.tag = cmd.tag;
                }
                return t;
              });
              setState({
                ...state,
                tasks: mupdated
              });
              break;
            case "b":
            case "begin":
              const bupdated = state.tasks.map(t => {
                if (t.id === cmd.id) {
                  if (t.status !== TaskStatus.WIP) {
                    t.status = TaskStatus.WIP;
                    t.logs = (t.logs || []).concat({ start: Date.now(), end: 0 });
                  }
                }
                return t;
              });
              setState({
                ...state,
                tasks: bupdated
              });
              break;
            case "c":
            case "check":
              const cupdated = state.tasks.map(t => {
                if (t.id === cmd.id) {
                  t.status = t.status === TaskStatus.DONE ? TaskStatus.WAIT : TaskStatus.DONE;
                  if (t.status === TaskStatus.DONE) {
                    t = stopWorkLogging(t);
                  }
                }
                return t;
              });
              setState({
                ...state,
                tasks: cupdated
              });
              break;
            case "d":
            case "delete":
              const dupdated = state.tasks.reduce((tasks, t) => {
                if (t.id !== cmd.id) {
                  tasks.push(t);
                }
                return tasks;
              }, []);
              setState({
                ...state,
                tasks: dupdated
              });
              break;
            case "fl":
            case "flag":
              const flupdated = state.tasks.map(t => {
                if (t.id === cmd.id) {
                  t.status = t.status === TaskStatus.FLAG ? TaskStatus.WAIT : TaskStatus.FLAG;
                  t = stopWorkLogging(t);
                }
                return t;
              });
              setState({
                ...state,
                tasks: flupdated
              });
              break;
            case "st":
            case "stop":
              const stupdated = state.tasks.map(t => {
                if (t.id === cmd.id) {
                  if (t.status === TaskStatus.WIP) {
                    t.status = TaskStatus.WAIT;
                    t = stopWorkLogging(t);
                  }
                }
                return t;
              });
              setState({
                ...state,
                tasks: stupdated
              });
              break;
            case "t":
            case "task":
              const tag = cmd.tag || "@uncategorized";
              const task = cmd.text;
              if (task && task.length) {
                const nextId = state.tasks.reduce((maxId: number, t: TaskItem) => {
                  if (t.id > maxId) {
                    maxId = t.id;
                  }
                  return maxId;
                }, 0);
                setState({
                  ...state,
                  tasks: state.tasks.concat({
                    id: nextId + 1,
                    tag: tag,
                    title: task,
                    status: TaskStatus.WAIT
                  } as TaskItem)
                })
              }
              break;
            case "e":
            case "edit": {
              const id = cmd.id;
              const task = cmd.text;
              if (task && task.length) {
                setState({
                  ...state,
                  tasks: state.tasks.map(t => {
                    if (t.id === id) {
                      t.title = task;
                    }
                    return t;
                  })
                });
              }
            }
            break;
            case "help":
              setState({
                ...state,
                showHelp: true
              });
              break;
            case "close-help":
              setState({
                ...state,
                showHelp: false
              });
              break;
            case "today":
              setState({
                ...state,
                showToday: !state.showToday
              });
              break;
          }
        }
        inputRef.current.value = "";
      }
    }
  };

  const taskGroups = state.tasks.reduce((groups, t) => {
    if (!groups[t.tag]) {
      groups[t.tag] = [];
    }
    groups[t.tag].push(t);
    return groups;
  }, {});

  const summary = state.tasks.reduce((stats, t) => {
    switch (t.status) {
      case TaskStatus.WAIT:
        stats.pending += 1;
        break;
      case TaskStatus.DONE:
        stats.done += 1;
        break;
      case TaskStatus.WIP:
        stats.wip += 1;
        break;
    }
    return stats;
  }, {
    done: 0,
    wip: 0,
    pending: 0
  })

  return <StateContext.Provider value={[state, setState]}>
    <div className="w-full h-full flex flex-col font-mono">
      <div className="p-2 bg-gray-100 text-sm"></div>
      <div className="flex-1 flex flex-col sm:flex-row">
        <div className="flex-1 p-5">
          {Object.keys(taskGroups).map((g, i) => [
            <Row key={`tag-${i}`} type={RowType.TAG} text={g} />,
            taskGroups[g].map((t, j) => <Row key={`tag-${i}-inner-task-${j}`} type={RowType.TASK} task={t} />),
            <Row key={`tag-${i}-separator-${i}`} type={RowType.TEXT} text="" />
          ])}
          <Row type={RowType.TEXT} text={`${(summary.done/state.tasks.length * 100 || 0).toFixed(0)}% of all tasks complete.`} />
          <Row type={RowType.TEXT} text={`<span class="text-green-500">${summary.done}</span> done · <span class="text-orange-500">${summary.wip}</span> in-progress · <span class="text-purple-500">${summary.pending}</span> waiting`} />
        </div>
        {state.showToday ? <div className="w-full mb-20 sm:mb-0 sm:w-2/6 p-5 text-sm text-gray-700 sm:text-gray-500 text-left border-l">
          <Today />
        </div> : null}
        {state.showHelp ? <div className="w-full mb-20 sm:mb-0 sm:w-2/6 p-5 text-sm text-gray-700 sm:text-gray-500 text-left border-l" style={{transition: 'all 0.5s'}}>
        Type the command in the input box below, starting with:<br/>
        &nbsp; <b>t</b> or <b>task</b>&nbsp;&nbsp;&nbsp; Add a new task<br/>
        &nbsp; <b>b</b> or <b>begin</b>&nbsp;&nbsp; Start working on a task<br/>
        &nbsp; <b>c</b> or <b>check</b>&nbsp;&nbsp; Check to mark a task as done<br/>
        &nbsp; <b>d</b> or <b>delete</b>&nbsp; Delete a task<br/>
        &nbsp; <b>e</b> or <b>edit</b>&nbsp; Edit a task title<br/>
        &nbsp; <b>mv</b> or <b>move</b>&nbsp;&nbsp; Move a task to another tag<br/>
        &nbsp; <b>fl</b> or <b>flag</b>&nbsp;&nbsp; Toggle a flag<br/>
        &nbsp; <b>st</b> or <b>stop</b>&nbsp;&nbsp; Stop working on a task<br/>
        &nbsp; <b>today</b>: Show today activities<br/>
        <br/>
        Example:<br/>
        &nbsp; <code>t @work This is a new task</code><br/>
        &nbsp; <code>task @longer-tag This is another task</code><br/>
        &nbsp; <code>b 10</code> or <code>begin 12</code><br/>
        &nbsp; <code>c 7</code>&nbsp; or <code>check 9</code><br/>
        &nbsp; <code>d 3</code>&nbsp; or <code>delete 3</code><br/>
        &nbsp; <code>e 1 this is a new task description</code><br/>
        &nbsp; <code>mv 2 @new-tag</code> or <code>move 2 @uncategorized</code><br/>
        &nbsp; <code>fl 2</code> or <code>flag 2</code><br/>
        &nbsp; <code>st 1</code> or <code>stop 1</code><br/>
        &nbsp; <code>edit 1 a new task description goes here</code><br/>
        <br/>
        Other commands:<br/>
        &nbsp; <b>close-help</b>: Close this help text<br/>
        &nbsp; <b>help</b>: Show this help text<br/>
      </div> : null}
    </div>
    <input ref={inputRef} className="bg-gray-300 w-full p-2 text-sm fixed bottom-0 left-0" tabIndex={0} autoFocus={true} onKeyPress={onKeyPress} placeholder="enter anything here..." />
  </div>
  </StateContext.Provider>;
};